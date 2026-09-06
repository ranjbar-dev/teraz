import {
  randomBytes,
  sign,
  createCipheriv,
  publicEncrypt,
  constants,
  createPublicKey,
  X509Certificate,
  createPrivateKey,
} from 'node:crypto';
import {
  db,
  Tx,
  D,
  money,
  json,
  encrypt,
  decrypt,
  ApiError,
  Principal,
  Scope,
  requirePermission,
  requireSubscription,
  transaction,
  audit,
} from './core';
import { invoiceTotal } from './accounting';
export function signModian(payload: unknown, privateKey: string, certificate: string) {
  const cert = new X509Certificate(certificate),
    key = createPrivateKey(privateKey);
  if (
    !cert.checkPrivateKey(key) ||
    Date.parse(cert.validTo) < Date.now() ||
    Date.parse(cert.validFrom) > Date.now()
  )
    throw new ApiError('گواهی و کلید امضا معتبر یا متناظر نیستند.', 422);
  const header = {
    alg: 'RS256',
    x5c: [cert.raw.toString('base64')],
    sigT: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    crit: ['sigT'],
  };
  const data = [header, payload]
    .map((v) => Buffer.from(JSON.stringify(v)).toString('base64url'))
    .join('.');
  return data + '.' + sign('RSA-SHA256', Buffer.from(data), key).toString('base64url');
}
export function encryptModian(signed: string, keyBase64: string, keyId: string) {
  const key = createPublicKey({
      key: Buffer.from(keyBase64, 'base64'),
      format: 'der',
      type: 'spki',
    }),
    cek = randomBytes(32),
    iv = randomBytes(12),
    protectedHeader = Buffer.from(
      JSON.stringify({ alg: 'RSA-OAEP-256', enc: 'A256GCM', kid: keyId }),
    ).toString('base64url');
  const wrapped = publicEncrypt(
      { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      cek,
    ),
    cipher = createCipheriv('aes-256-gcm', cek, iv);
  cipher.setAAD(Buffer.from(protectedHeader));
  const encrypted = Buffer.concat([cipher.update(signed, 'utf8'), cipher.final()]);
  return [
    protectedHeader,
    wrapped.toString('base64url'),
    iv.toString('base64url'),
    encrypted.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}
const safeNumber = (v: unknown) => {
  const d = D(v);
  if (d.abs().gt(Number.MAX_SAFE_INTEGER))
    throw new ApiError('مبلغ از ظرفیت عددی سامانهٔ بیرونی بیشتر است.', 422);
  return d.toNumber();
};
export class ModianClient {
  constructor(
    private config: any,
    private fetcher: typeof fetch = fetch,
  ) {}
  base() {
    const url = new URL(
      process.env.MODIAN_BASE_URL || 'https://sandboxrc.tax.gov.ir/requestsmanager/api/v2/',
    );
    if (
      url.protocol !== 'https:' ||
      !url.hostname.endsWith('.tax.gov.ir') ||
      !url.hostname.startsWith('sandbox')
    )
      throw new ApiError('فقط نشانی آزمایشی تأییدشدهٔ مودیان قابل استفاده است.', 503);
    if (process.env.MODIAN_SANDBOX_VERIFIED !== 'true')
      throw new ApiError(
        'نشانی محیط آزمایشی مودیان هنوز توسط بهره‌بردار تأیید نشده است.',
        503,
        'SANDBOX_CONFIG_REQUIRED',
      );
    return url.href.endsWith('/') ? url.href : url.href + '/';
  }
  async request(endpoint: string, method = 'GET', body?: unknown, authenticate = true) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    if (authenticate) {
      const nonce = await this.request('nonce?timeToLive=60', 'GET', undefined, false);
      headers.Authorization =
        'Bearer ' +
        signModian(
          { nonce: nonce.nonce, clientId: this.config.fiscalId },
          this.config.privateKey,
          this.config.certificate,
        );
    }
    const res = await this.fetcher(this.base() + endpoint, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
    if (!res.ok)
      throw new ApiError(`سامانهٔ مودیان پاسخ ${res.status} داد.`, 502, 'MODIAN_PROVIDER_ERROR');
    return res.json();
  }
  async send(invoice: unknown, uid: string) {
    const server = await this.request('server-information');
    const key = server.publicKeys?.find((k: any) => k.purpose === 1 && k.algorithm === 'RSA');
    if (!key) throw new ApiError('کلید رمزگذاری سرور یافت نشد.', 502);
    const payload = encryptModian(
      signModian(invoice, this.config.privateKey, this.config.certificate),
      key.key,
      key.id,
    );
    return this.request('invoice', 'POST', [
      { payload, header: { requestTraceId: uid, fiscalId: this.config.fiscalId } },
    ]);
  }
  async inquire(uid: string, date: Date) {
    const params = new URLSearchParams({
      uidList: uid,
      fiscalId: this.config.fiscalId,
      start: new Date(date.getTime() - 3600000).toISOString(),
      end: new Date(Math.min(Date.now(), date.getTime() + 6 * 86400000)).toISOString(),
    });
    return this.request('inquiry-by-uid?' + params);
  }
}
export class IntegrationService {
  async list(p: Principal, s: Scope) {
    requirePermission(p, 'integrations.read');
    if (!['OWNER', 'ADMIN'].includes(p.role))
      throw new ApiError('تنظیم اتصال‌ها برای مدیر است.', 403);
    return {
      configs: (await db.integrationConfig.findMany({ where: { companyId: s.companyId } })).map(
        (c) => ({
          id: c.id,
          provider: c.provider,
          mode: c.mode,
          enabled: c.enabled,
          configured: true,
        }),
      ),
      jobs: await db.integrationJob.findMany({
        where: { companyId: s.companyId },
        select: {
          id: true,
          provider: true,
          recordId: true,
          status: true,
          result: true,
          attempts: true,
          createdAt: true,
          nextAttemptAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      modes: {
        zarinpal: 'sandbox',
        smsir: 'dry-run؛ سرویس آزمایشی اختصاصی تأیید نشده',
        modian: 'dry-run؛ اتصال نیازمند گواهی و تأیید نشانی sandbox',
      },
    };
  }
  async configure(p: Principal, s: Scope, provider: string, input: any) {
    requirePermission(p, 'integrations.write');
    if (!['smsir', 'modian'].includes(provider) || !['dry-run', 'sandbox'].includes(input.mode))
      throw new ApiError('ارائه‌دهنده یا محیط معتبر نیست.', 422);
    if (provider === 'smsir' && input.mode !== 'dry-run')
      throw new ApiError(
        'sms.ir محیط sandbox اختصاصی تأییدشده ندارد؛ پیش‌نمایش محلی فعال است.',
        422,
      );
    const old = await db.integrationConfig.findUnique({
      where: { companyId_provider: { companyId: s.companyId, provider } },
    });
    const config = { ...(old ? decrypt(old.encryptedConfig) : {}), ...input.config };
    if (provider === 'modian' && input.mode === 'sandbox') {
      if (!config.fiscalId || !config.privateKey || !config.certificate)
        throw new ApiError('شناسهٔ حافظه، گواهی و کلید امضا لازم است.', 422);
      new ModianClient(config).base();
      signModian({ validation: true }, config.privateKey, config.certificate);
    }
    return transaction(`org:${s.organizationId}`, async (tx) => {
      await requireSubscription(tx, p);
      const saved = await tx.integrationConfig.upsert({
        where: { companyId_provider: { companyId: s.companyId, provider } },
        create: {
          organizationId: s.organizationId,
          companyId: s.companyId,
          provider,
          mode: input.mode,
          enabled: input.enabled === true,
          encryptedConfig: encrypt(config),
        },
        update: {
          mode: input.mode,
          enabled: input.enabled === true,
          encryptedConfig: encrypt(config),
        },
      });
      await audit(
        tx,
        p,
        'integrations.configure',
        'تنظیمات اتصال رمزگذاری و ذخیره شد',
        s.companyId,
        saved.id,
        undefined,
        { provider, mode: saved.mode, enabled: saved.enabled },
      );
      return { ok: true };
    });
  }
  async invoice(tx: Tx, s: Scope, input: any, config: any) {
    const r = await tx.record.findFirst({
      where: {
        id: String(input.recordId || ''),
        companyId: s.companyId,
        module: { in: ['sales', 'sales-returns'] },
        postedAt: { not: null },
        reversedAt: null,
      },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!r) throw new ApiError('فاکتور فروش قطعی معتبر را انتخاب کنید.', 422);
    const c = await tx.company.findUniqueOrThrow({ where: { id: s.companyId } }),
      d = r.data as any,
      party = await tx.record.findUniqueOrThrow({ where: { id: d.personId } }),
      pd = party.data as any;
    const fiscalId = String(config.fiscalId || ''),
      taxid = String(input.taxId || '').toUpperCase();
    if (!/^[A-Z0-9]{6}[A-F0-9]{15}\d$/.test(taxid) || !taxid.startsWith(fiscalId))
      throw new ApiError('شمارهٔ مالیاتی ۲۲ نویسه‌ای متناظر با حافظه را وارد کنید.', 422);
    const tins = String((c.data as any).economicCode || (c.data as any).taxId || ''),
      tinb = String(pd.economicCode || pd.taxId || '');
    if (!/^\d{10,14}$/.test(tins) || !/^\d{10,14}$/.test(tinb))
      throw new ApiError('شمارهٔ اقتصادی فروشنده و خریدار لازم است.', 422);
    if (!['IRR', 'IRT'].includes(c.baseCurrency))
      throw new ApiError('الگوی یک برای ارز مبنای ریال/تومان پیاده شده است.', 422);
    const factor = D(d.exchangeRate || 1).mul(c.baseCurrency === 'IRT' ? 10 : 1),
      t = invoiceTotal(d, r.lines);
    const body: any[] = [];
    for (let i = 0; i < r.lines.length; i++) {
      const l = r.lines[i],
        product = await tx.record.findUniqueOrThrow({ where: { id: l.productId! } }),
        pr = product.data as any;
      if (!/^\d{13}$/.test(String(pr.taxId || '')) || !pr.taxUnit)
        throw new ApiError(`شناسهٔ کالا/خدمت و کد واحد مالیاتی ${product.name} را وارد کنید.`, 422);
      const before = D(l.quantity).mul(D(l.price)).mul(factor).round(),
        net = t.lineNet[i].mul(factor).round(),
        tax = t.lineTax[i].mul(factor).round();
      body.push({
        sstid: pr.taxId,
        sstt: product.name,
        mu: pr.taxUnit,
        am: safeNumber(l.quantity),
        fee: safeNumber(D(l.price).mul(factor)),
        prdis: safeNumber(before),
        dis: safeNumber(before.sub(net)),
        adis: safeNumber(net),
        vra: safeNumber(l.tax),
        vam: safeNumber(tax),
        tsstam: safeNumber(net.add(tax)),
      });
    }
    const total = (k: string) => body.reduce((a, b) => a.add(D((b as any)[k])), D(0));
    const header: any = {
      taxid,
      inno: String(input.serial || r.code),
      indatim: r.date!.getTime(),
      inty: 1,
      inp: 1,
      ins: r.module === 'sales-returns' ? 4 : 1,
      tins,
      tob: pd.legalType === 'حقوقی' ? 2 : 1,
      bid: pd.nationalId || tinb,
      tinb,
      tprdis: safeNumber(total('prdis')),
      tdis: safeNumber(total('dis')),
      tadis: safeNumber(total('adis')),
      tvam: safeNumber(total('vam')),
      todam: 0,
      tbill: safeNumber(total('tsstam')),
      setm: 2,
    };
    if (r.module === 'sales-returns') {
      const original = await tx.integrationJob.findFirst({
        where: {
          companyId: s.companyId,
          recordId: d.originalInvoiceId,
          provider: 'modian',
          status: 'SUCCESS',
        },
      });
      if (!original) throw new ApiError('فاکتور مرجع باید در مودیان پذیرفته شده باشد.', 422);
      header.irtaxid = (original.payload as any).invoice.header.taxid;
    }
    return { record: r, invoice: { header, body, payments: [] } };
  }
  async enqueue(p: Principal, s: Scope, provider: string, input: any) {
    requirePermission(p, 'integrations.write');
    if (!['modian', 'smsir'].includes(provider)) throw new ApiError('اتصال یافت نشد.', 404);
    return transaction(`org:${s.organizationId}`, async (tx) => {
      await requireSubscription(tx, p);
      const cfg = await tx.integrationConfig.findUnique({
        where: { companyId_provider: { companyId: s.companyId, provider } },
      });
      if (!cfg?.enabled) throw new ApiError('ابتدا اتصال را تنظیم و فعال کنید.', 422);
      const config = decrypt(cfg.encryptedConfig);
      let payload: any, recordId: string | undefined;
      if (provider === 'modian') {
        const invoice = await this.invoice(tx, s, input, config);
        recordId = invoice.record.id;
        const exists = await tx.integrationJob.findFirst({
          where: {
            companyId: s.companyId,
            provider,
            recordId,
            status: { notIn: ['FAILED', 'DRY_RUN'] },
          },
        });
        if (exists) throw new ApiError('این صورتحساب در صف است یا قبلاً ارسال شده است.', 409);
        payload = { invoice: invoice.invoice, mode: cfg.mode };
      } else {
        if (
          !/^09\d{9}$/.test(String(input.mobile || '')) ||
          !String(input.message || '').trim() ||
          String(input.message).length > 1000
        )
          throw new ApiError('شماره همراه و متن پیام معتبر نیست.', 422);
        payload = { mobile: input.mobile, message: input.message, mode: 'dry-run' };
      }
      const job = await tx.integrationJob.create({
        data: {
          organizationId: s.organizationId,
          companyId: s.companyId,
          provider,
          recordId,
          payload: json(payload),
        },
      });
      await audit(
        tx,
        p,
        'integrations.enqueue',
        'درخواست اتصال در صف قرار گرفت',
        s.companyId,
        job.id,
        undefined,
        { provider, recordId, mode: cfg.mode },
      );
      return { id: job.id, status: job.status, mode: cfg.mode };
    });
  }
  async retry(p: Principal, s: Scope, id: string) {
    requirePermission(p, 'integrations.write');
    const job = await db.integrationJob.findFirst({ where: { id, companyId: s.companyId } });
    if (!job || !['FAILED', 'REVIEW_REQUIRED'].includes(job.status))
      throw new ApiError('این درخواست قابل تلاش مجدد نیست.', 422);
    await requireSubscription(db, p);
    await db.integrationJob.update({
      where: { id },
      data: { status: 'PENDING', attempts: 0, nextAttemptAt: new Date() },
    });
    return { ok: true };
  }
}
export async function processJob() {
  const claimed = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      any[]
    >`SELECT * FROM "IntegrationJob" WHERE (("status" IN ('PENDING','RETRY','RECEIVED') AND "nextAttemptAt" <= now()) OR ("status"='PROCESSING' AND "lockedAt" < now()-interval '5 minutes')) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows.length) return null;
    return tx.integrationJob.update({
      where: { id: rows[0].id },
      data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 } },
    });
  });
  if (!claimed) return false;
  try {
    const cfg = await db.integrationConfig.findUnique({
        where: { companyId_provider: { companyId: claimed.companyId, provider: claimed.provider } },
      }),
      payload = claimed.payload as any;
    if (!cfg?.enabled) throw new ApiError('اتصال غیرفعال است.', 422);
    if (payload.mode === 'dry-run') {
      await db.integrationJob.update({
        where: { id: claimed.id },
        data: {
          status: 'DRY_RUN',
          lockedAt: null,
          result: {
            message: 'اعتبارسنجی محلی انجام شد؛ هیچ داده‌ای به سرویس بیرونی ارسال نشده است.',
            preview: payload,
          },
        },
      });
      return true;
    }
    const client = new ModianClient(decrypt(cfg.encryptedConfig));
    let result = claimed.result as any;
    if (result?.sent || claimed.attempts > 1) {
      const inquiry = await client.inquire(claimed.id, claimed.createdAt);
      const item = Array.isArray(inquiry) ? inquiry.find((i: any) => i.uid === claimed.id) : null;
      if (item && ['SUCCESS', 'FAILED'].includes(item.status)) {
        await db.integrationJob.update({
          where: { id: claimed.id },
          data: { status: item.status, result: json(item), lockedAt: null },
        });
        return true;
      }
      if (claimed.attempts >= 10) {
        await db.integrationJob.update({
          where: { id: claimed.id },
          data: {
            status: 'REVIEW_REQUIRED',
            lockedAt: null,
            result: json({
              message: 'نتیجهٔ قطعی دریافت نشد؛ قبل از ارسال مجدد در کارپوشه بررسی کنید.',
              inquiry,
            }),
          },
        });
        return true;
      }
      result = { ...result, inquiry };
    } else {
      const org = await db.organization.findUnique({
        where: { id: claimed.organizationId },
        include: { subscription: true },
      });
      if (org?.status !== 'ACTIVE' || !org.subscription || org.subscription.endsAt < new Date())
        throw new ApiError('اشتراک سازمان فعال نیست.', 402);
      result = { sent: true, response: await client.send(payload.invoice, claimed.id) };
    }
    await db.integrationJob.update({
      where: { id: claimed.id },
      data: {
        status: 'RECEIVED',
        result: json(result),
        lockedAt: null,
        nextAttemptAt: new Date(Date.now() + 30000),
      },
    });
  } catch (e) {
    await db.integrationJob.update({
      where: { id: claimed.id },
      data: {
        status: claimed.attempts >= 5 ? 'REVIEW_REQUIRED' : 'RETRY',
        lockedAt: null,
        nextAttemptAt: new Date(Date.now() + Math.min(300000, 10000 * 2 ** claimed.attempts)),
        result: json({
          ...(claimed.result as any),
          error: e instanceof ApiError ? e.message : 'خطای ارتباط؛ نتیجه نیازمند استعلام است.',
        }),
      },
    });
  }
  return true;
}
export function runWorker() {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void processJob()
      .catch(() => console.error('Integration worker failed'))
      .finally(() => {
        busy = false;
      });
  }, 2000);
  timer.unref();
  return () => clearInterval(timer);
}
