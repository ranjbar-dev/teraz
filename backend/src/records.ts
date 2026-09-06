import { randomUUID } from 'node:crypto';
import {
  db,
  Tx,
  D,
  money,
  json,
  moduleOf,
  modules,
  masters,
  ApiError,
  Principal,
  Scope,
  validDate,
  transaction,
  requirePermission,
  requireSubscription,
  recordWhere,
  scopeFor,
  serializeRecord,
  audit,
  normalize,
  hash,
  passwordHash,
  roleCode,
  roleLabel,
} from './core';
import { AccountingService, invoiceTotal, openYear } from './accounting';
import { createCompany } from './provision';
const postedStatus = (key: string, status: string) =>
  !masters.has(key) &&
  key !== 'quotes' &&
  (key === 'checks'
    ? ['در جریان', 'وصول شده'].includes(status)
    : key === 'production'
      ? status === 'تکمیل شده'
      : ['تأیید شده', 'پرداخت شده'].includes(status));
export class RecordsService {
  accounting = new AccountingService();
  async list(p: Principal, s: Scope, key: string, q: Record<string, any> = {}) {
    requirePermission(p, `${key}.read`);
    const definition = moduleOf(key);
    if (definition.admin && !['OWNER', 'ADMIN'].includes(p.role))
      throw new ApiError('این بخش برای مدیر سازمان است.', 403);
    if (key === 'companies') {
      const rows = await db.company.findMany({
        where: {
          organizationId: p.organizationId!,
          ...(!['OWNER', 'ADMIN'].includes(p.role) && p.companyIds.length
            ? { id: { in: p.companyIds } }
            : {}),
        },
      });
      return {
        rows: rows.map((c) => ({
          ...(c.data as object),
          id: c.id,
          companyId: c.id,
          organizationId: c.organizationId,
          name: c.name,
          code: c.code,
          status: c.status,
          baseCurrency: c.baseCurrency,
          createdAt: c.createdAt.toISOString(),
        })),
      };
    }
    if (key === 'users') return { rows: await this.users(p) };
    const all = await db.record.findMany({
      where: recordWhere(s, key),
      include: { lines: { orderBy: { position: 'asc' } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    let rows = await Promise.all(all.map((r) => this.decorate(s, r)));
    const search = normalize(q.q || '');
    const filters = q.filters ? JSON.parse(String(q.filters)) : {};
    const lookup = await db.record.findMany({
      where: { companyId: s.companyId },
      select: { id: true, name: true, code: true },
    });
    const labels = new Map(lookup.map((r) => [r.id, `${r.name} ${r.code}`]));
    const text = (value: unknown) => normalize(`${value ?? ''} ${labels.get(String(value)) || ''}`);
    rows = rows.filter(
      (r) =>
        (!search || Object.values(r).some((v) => text(v).includes(search))) &&
        Object.entries(filters).every(
          ([key, value]) => !value || text((r as any)[key]).includes(normalize(value)),
        ),
    );
    if (q.status && q.status !== 'all') rows = rows.filter((r) => r.status === q.status);
    if (q.sort) {
      const desc = String(q.sort).startsWith('-'),
        k = String(q.sort).replace(/^-/, '');
      rows.sort(
        (a, b) =>
          text((a as any)[k]).localeCompare(text((b as any)[k]), 'fa', { numeric: true }) *
          (desc ? -1 : 1),
      );
    }
    const totalCount = rows.length;
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 25)),
      page = Math.max(1, Number(q.page) || 1);
    return {
      rows: q.limit ? rows.slice((page - 1) * limit, page * limit) : rows,
      totalCount,
      page,
      limit,
    };
  }
  async get(p: Principal, s: Scope, key: string, id: string) {
    if (['companies', 'users'].includes(key)) {
      const r = (await this.list(p, s, key)).rows.find((r: any) => r.id === id);
      if (!r) throw new ApiError('رکورد یافت نشد.', 404);
      return r;
    }
    requirePermission(p, `${key}.read`);
    const r = await db.record.findFirst({
      where: { ...recordWhere(s, key), id },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    if (!r) throw new ApiError('رکورد یافت نشد.', 404, 'NOT_FOUND');
    return this.decorate(s, r);
  }
  async decorate(s: Scope, r: any) {
    const out = serializeRecord(r);
    if (['sales', 'purchases'].includes(r.module)) {
      const a = await db.allocation.aggregate({
        where: { invoiceId: r.id, companyId: s.companyId, active: true },
        _sum: { amount: true },
      });
      out.paid = money(a._sum.amount || 0);
      out.remaining = money(D(r.total).sub(D(out.paid)));
    }
    if (r.module === 'banks') {
      const lines = await db.journalLine.findMany({
        where: { bankId: r.id, journal: { companyId: s.companyId } },
      });
      out.balance = money(lines.reduce((v, l) => v.add(D(l.foreignAmount)), D(0)));
    }
    if (r.module === 'assets') {
      const dep = await db.record.aggregate({
        where: {
          companyId: s.companyId,
          module: 'depreciation',
          postedAt: { not: null },
          reversedAt: null,
          data: { path: ['assetId'], equals: r.id },
        },
        _sum: { total: true },
      });
      out.bookValue = money(D((r.data as any).cost).sub(D(dep._sum.total || 0)));
    }
    return out;
  }
  async users(p: Principal) {
    requirePermission(p, 'users.read');
    const members = await db.membership.findMany({
      where: { organizationId: p.organizationId! },
      include: { user: true },
    });
    return members.map((m) => ({
      id: m.userId,
      companyId: '',
      organizationId: m.organizationId,
      name: m.user.name,
      email: m.user.email,
      role: roleLabel(m.role),
      companyIds: m.companyIds,
      permissions: m.permissions,
      status: m.active && m.user.active ? 'فعال' : 'غیرفعال',
      createdAt: m.user.createdAt.toISOString(),
    }));
  }
  async userWrite(tx: Tx, p: Principal, input: any, id?: string) {
    requirePermission(p, 'users.write');
    const sub = await requireSubscription(tx, p);
    const role = roleCode(String(input.role || 'VIEWER'));
    if (!['ADMIN', 'ACCOUNTANT', 'VIEWER'].includes(role))
      throw new ApiError('نقش معتبر نیست.', 422);
    if (id === p.userId && (role !== p.role || input.status === 'غیرفعال'))
      throw new ApiError('نقش و وضعیت خود را از این مسیر تغییر ندهید.', 422);
    const companyIds = Array.isArray(input.companyIds) ? input.companyIds.map(String) : [];
    if (
      (await tx.company.count({
        where: { organizationId: p.organizationId!, id: { in: companyIds } },
      })) !== companyIds.length
    )
      throw new ApiError('محدودهٔ شرکت‌های کاربر معتبر نیست.', 422);
    const email = String(input.email || '')
        .trim()
        .toLowerCase(),
      name = String(input.name || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2)
      throw new ApiError('نام و ایمیل معتبر وارد کنید.', 422);
    let user;
    if (id) {
      const member = await tx.membership.findUnique({
        where: { organizationId_userId: { organizationId: p.organizationId!, userId: id } },
      });
      if (!member || member.role === 'OWNER') throw new ApiError('این عضویت قابل تغییر نیست.', 403);
      if (
        !member.active &&
        input.status !== 'غیرفعال' &&
        (await tx.membership.count({
          where: { organizationId: p.organizationId!, active: true },
        })) >= sub.plan.userLimit
      )
        throw new ApiError('ظرفیت کاربران پلن تکمیل شده است.', 402, 'PLAN_LIMIT');
      user = await tx.user.findUniqueOrThrow({ where: { id } });
      if (
        (user.email !== email || user.name !== name || input.password) &&
        (await tx.membership.count({ where: { userId: id } })) > 1
      )
        throw new ApiError('ایمیل حساب مشترک از پروفایل شخصی تغییر می‌کند.', 422);
      user = await tx.user.update({
        where: { id },
        data: {
          name,
          email,
          ...(input.password ? { passwordHash: await passwordHash(String(input.password)) } : {}),
        },
      });
      await tx.membership.update({
        where: { id: member.id },
        data: {
          role,
          companyIds: json(companyIds),
          permissions: json(Array.isArray(input.permissions) ? input.permissions : []),
          active: input.status !== 'غیرفعال',
        },
      });
      if (input.password || input.status === 'غیرفعال')
        await tx.session.deleteMany({ where: { userId: id, organizationId: p.organizationId } });
    } else {
      if (
        (await tx.membership.count({
          where: { organizationId: p.organizationId!, active: true },
        })) >= sub.plan.userLimit
      )
        throw new ApiError('ظرفیت کاربران پلن تکمیل شده است.', 402, 'PLAN_LIMIT');
      if (await tx.user.findUnique({ where: { email } }))
        throw new ApiError(
          'این ایمیل حساب دارد؛ افزودن حساب موجود فقط با دعوت و پذیرش انجام می‌شود.',
          409,
          'USER_EXISTS',
        );
      user = await tx.user.create({
        data: { name, email, passwordHash: await passwordHash(String(input.password || '')) },
      });
      await tx.membership.create({
        data: {
          organizationId: p.organizationId!,
          userId: user.id,
          role,
          companyIds: json(companyIds),
        },
      });
    }
    await audit(tx, p, 'users.write', `عضویت ${name} ذخیره شد`, undefined, user.id);
    return { id: user.id, name, email, role: roleLabel(role), status: input.status || 'فعال' };
  }
  async write(
    p: Principal,
    s: Scope,
    key: string,
    input: any,
    id?: string,
    idempotencyKey?: string,
  ) {
    requirePermission(p, `${key}.write`);
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new ApiError('بدنهٔ درخواست معتبر نیست.', 422);
    return transaction(`org:${s.organizationId}`, async (tx) => {
      const sub = await requireSubscription(tx, p);
      const requestHash = hash(JSON.stringify({ key, id, input }));
      if (idempotencyKey) {
        const previous = await tx.idempotency.findUnique({
          where: { organizationId_key: { organizationId: s.organizationId, key: idempotencyKey } },
        });
        if (previous) {
          if (previous.requestHash !== requestHash)
            throw new ApiError(
              'کلید تکرار با درخواست متفاوت استفاده شده است.',
              409,
              'IDEMPOTENCY_CONFLICT',
            );
          return previous.response;
        }
      }
      let result: any;
      if (key === 'users') result = await this.userWrite(tx, p, input, id);
      else if (key === 'companies') {
        requirePermission(p, 'companies.write');
        if (input.baseCurrency && !['IRT', 'IRR', 'USD', 'EUR', 'AED'].includes(input.baseCurrency))
          throw new ApiError('ارز مبنای شرکت معتبر نیست.', 422);
        if (id) {
          const c = await tx.company.findFirst({
            where: { id, organizationId: p.organizationId! },
          });
          if (!c) throw new ApiError('شرکت یافت نشد.', 404);
          if (
            input.baseCurrency &&
            input.baseCurrency !== c.baseCurrency &&
            (await tx.journal.count({ where: { companyId: id } }))
          )
            throw new ApiError('ارز مبنای شرکت دارای سند قطعی قابل تغییر نیست.', 422);
          const updated = await tx.company.update({
            where: { id },
            data: {
              name: String(input.name || c.name),
              status: input.status || c.status,
              data: json({ ...(c.data as any), ...input }),
              ...(input.baseCurrency ? { baseCurrency: input.baseCurrency } : {}),
            },
          });
          result = { ...(updated.data as any), ...updated };
        } else {
          if (
            (await tx.company.count({ where: { organizationId: p.organizationId! } })) >=
            sub.plan.companyLimit
          )
            throw new ApiError('ظرفیت شرکت‌های پلن تکمیل شده است.', 402, 'PLAN_LIMIT');
          result = await createCompany(tx, p.organizationId!, input);
        }
        await audit(tx, p, 'companies.write', 'شرکت ذخیره شد', result.id, result.id);
      } else result = await this.saveRecord(tx, p, s, key, input, id, sub.plan.documentLimit);
      if (idempotencyKey)
        await tx.idempotency.create({
          data: {
            organizationId: s.organizationId,
            key: idempotencyKey,
            requestHash,
            response: json(result),
          },
        });
      return result;
    });
  }
  async saveRecord(
    tx: Tx,
    p: Principal,
    s: Scope,
    key: string,
    input: any,
    id: string | undefined,
    documentLimit: number,
  ) {
    const mod = moduleOf(key);
    const old = id
      ? await tx.record.findFirst({
          where: { ...recordWhere(s, key), id },
          include: { lines: { orderBy: { position: 'asc' } } },
        })
      : null;
    if (id && !old) throw new ApiError('رکورد یافت نشد.', 404);
    if (old && (input.version === undefined || Number(input.version) !== old.version))
      throw new ApiError(
        'این رکورد توسط کاربر دیگری تغییر کرده؛ صفحه را تازه کنید.',
        409,
        'VERSION_CONFLICT',
      );
    if (old?.postedAt) {
      if (
        key === 'checks' &&
        input.status === 'وصول شده' &&
        Object.keys(input).every((k) => ['status', 'version'].includes(k))
      ) {
        await this.accounting.collectCheck(tx, p, s, old);
        return serializeRecord(
          await tx.record.update({
            where: { id: old.id },
            data: { status: 'وصول شده', version: { increment: 1 } },
            include: { lines: true },
          }),
        );
      }
      if (
        key === 'payroll' &&
        input.status === 'پرداخت شده' &&
        Object.keys(input).every((k) => ['status', 'version'].includes(k))
      ) {
        await this.accounting.payPayroll(tx, p, s, old);
        return serializeRecord(
          await tx.record.update({
            where: { id: old.id },
            data: { status: 'پرداخت شده', version: { increment: 1 } },
            include: { lines: true },
          }),
        );
      }
      throw new ApiError(
        'سند قطعی قابل ویرایش نیست؛ از عملیات سند برگشتی استفاده کنید.',
        409,
        'IMMUTABLE_DOCUMENT',
      );
    }
    const data: any = { ...((old?.data as any) || {}) };
    for (const f of mod.fields) {
      if (f.key === 'password') continue;
      const value = input[f.key] ?? data[f.key] ?? f.default ?? '';
      if (f.required && (value === '' || value === null))
        throw new ApiError(`${f.label} را وارد کنید.`, 422, 'REQUIRED_FIELD', {
          [f.key]: `${f.label} ضروری است.`,
        });
      if (['money', 'number'].includes(f.type || '') && value !== '') {
        const d = D(value);
        if (d.lt(f.min ?? 0) || d.gt(f.max ?? '999999999999999999'))
          throw new ApiError(`${f.label} خارج از محدوده است.`, 422, 'OUT_OF_RANGE');
        data[f.key] = money(d);
      } else {
        if (typeof value !== 'string' && typeof value !== 'number')
          throw new ApiError(`${f.label} معتبر نیست.`, 422);
        data[f.key] = String(value).trim().slice(0, 4000);
      }
      if (f.options && data[f.key] && !f.options.includes(data[f.key]))
        throw new ApiError(`${f.label} معتبر نیست.`, 422);
      if (f.type === 'date' && data[f.key]) validDate(data[f.key]);
      if (f.ref && data[f.key]) {
        const ref = await tx.record.findFirst({
          where: { id: data[f.key], companyId: s.companyId, module: f.ref },
        });
        if (!ref || ref.id === id || ref.status === 'غیرفعال')
          throw new ApiError(`${f.label} در شرکت جاری معتبر نیست.`, 422, 'INVALID_REFERENCE');
      }
    }
    for (const key of [
      'allocations',
      'originalInvoiceId',
      'unitCost',
      'employerInsurance',
      'payrollCalculation',
      'employeeInsuranceBase',
      'taxableBase',
      'days',
      'overtimeHours',
      'insuranceExempt',
      'taxExempt',
      'unemploymentExempt',
      'ruleId',
    ])
      if (input[key] !== undefined) data[key] = input[key];
    if (key === 'accounts' && data.parentId) {
      let parent = data.parentId;
      const visited = new Set([id]);
      while (parent) {
        if (visited.has(parent)) throw new ApiError('ساختار حساب حلقه دارد.', 422);
        visited.add(parent);
        parent = (await tx.record.findUnique({ where: { id: parent } }))?.data as any;
        parent = parent?.parentId;
      }
    }
    if (
      old &&
      ['banks', 'assets'].includes(key) &&
      (await tx.journal.findFirst({ where: { sourceId: old.id } }))
    ) {
      for (const k of key === 'banks'
        ? ['openingBalance', 'currency', 'exchangeRate']
        : ['cost', 'salvage', 'life'])
        if (String(data[k]) !== String((old.data as any)[k]))
          throw new ApiError(
            'مقادیر مالی افتتاحیه ثبت شده‌اند و مستقیم قابل تغییر نیستند.',
            409,
            'IMMUTABLE_OPENING',
          );
    }
    if (
      old &&
      key === 'accounts' &&
      (await tx.journalLine.count({ where: { accountId: old.id } })) &&
      ['code', 'type'].some(
        (k) => String(data[k]) !== String(k === 'code' ? old.code : (old.data as any)[k]),
      )
    )
      throw new ApiError('کد و ماهیت حساب دارای گردش قابل تغییر نیست.', 409);
    const status = String(input.status ?? old?.status ?? mod.status?.[0] ?? 'فعال');
    if (mod.status && !mod.status.includes(status)) throw new ApiError('وضعیت معتبر نیست.', 422);
    let branchId =
      old?.branchId || String(s.branchId === 'all' ? input.branchId || '' : s.branchId);
    if (!branchId)
      branchId =
        (
          await tx.record.findFirst({
            where: { companyId: s.companyId, module: 'branches', status: 'فعال' },
          })
        )?.id || '';
    if (key === 'warehouses' && !branchId) throw new ApiError('انبار باید شعبه داشته باشد.', 422);
    if (
      branchId &&
      !(await tx.record.findFirst({
        where: { id: branchId, companyId: s.companyId, module: 'branches', status: 'فعال' },
      }))
    )
      throw new ApiError('شعبه معتبر نیست.', 422);
    const date = data.date ? validDate(data.date) : null;
    if (!masters.has(key)) {
      if (!date) throw new ApiError('تاریخ لازم است.', 422);
      await openYear(tx, s, date);
      if (!id) {
        const first = new Date();
        first.setUTCDate(1);
        first.setUTCHours(0, 0, 0, 0);
        const count = await tx.record.count({
          where: {
            organizationId: s.organizationId,
            createdAt: { gte: first },
            module: { notIn: [...masters] },
          },
        });
        if (count >= documentLimit)
          throw new ApiError('سقف اسناد ماهانهٔ پلن پر شده است.', 402, 'PLAN_LIMIT');
      }
    }
    if (key === 'fiscal-years') {
      if ((status === 'بسته' && !old) || old?.status === 'بسته')
        throw new ApiError('سال مالی بسته از این مسیر ایجاد یا بازگشایی نمی‌شود.', 409);
      if (
        old &&
        (await tx.journal.count({ where: { companyId: s.companyId, yearId: old.id } })) &&
        ['startDate', 'endDate'].some((k) => data[k] !== (old.data as any)[k])
      )
        throw new ApiError('تاریخ دورهٔ دارای سند قابل تغییر نیست.', 409);
      if (validDate(data.startDate) >= validDate(data.endDate))
        throw new ApiError('پایان دوره باید بعد از شروع باشد.', 422);
      const years = await tx.record.findMany({
        where: { companyId: s.companyId, module: key, ...(id ? { id: { not: id } } : {}) },
      });
      if (
        years.some((y) => {
          const a = y.data as any;
          return data.startDate <= a.endDate && data.endDate >= a.startDate;
        })
      )
        throw new ApiError('سال مالی با دورهٔ موجود هم‌پوشانی دارد.', 422);
      if (old && status === 'بسته' && old.status !== 'بسته')
        throw new ApiError('بستن سال از عملیات پایان سال انجام می‌شود.', 422, 'USE_CLOSE_YEAR');
    }
    const rawLines = mod.kind ? (input.lines ?? old?.lines ?? []) : [];
    if (!Array.isArray(rawLines) || rawLines.length > 500 || (mod.kind && !rawLines.length))
      throw new ApiError('تعداد ردیف‌ها باید بین ۱ و ۵۰۰ باشد.', 422);
    const lines = [] as any[];
    for (let i = 0; i < rawLines.length; i++) {
      const l = rawLines[i];
      const productId = mod.kind === 'journal' ? null : String(l.productId || ''),
        accountId = mod.kind === 'journal' ? String(l.accountId || '') : null;
      const ref = await tx.record.findFirst({
        where: {
          id: (productId || accountId)!,
          companyId: s.companyId,
          module: mod.kind === 'journal' ? 'accounts' : 'products',
          status: 'فعال',
        },
      });
      if (!ref) throw new ApiError(`مرجع ردیف ${i + 1} معتبر نیست.`, 422);
      const quantity = D(l.quantity ?? 1),
        price = D(l.price ?? 0),
        discount = D(l.discount ?? 0),
        tax = D(l.tax ?? 0),
        debit = D(l.debit ?? 0),
        credit = D(l.credit ?? 0);
      if (
        quantity.lte(0) ||
        price.lt(0) ||
        discount.lt(0) ||
        discount.gt(100) ||
        tax.lt(0) ||
        tax.gt(100) ||
        debit.lt(0) ||
        credit.lt(0)
      )
        throw new ApiError(`مقادیر ردیف ${i + 1} معتبر نیست.`, 422);
      if (mod.kind === 'journal' && debit.gt(0) && credit.gt(0))
        throw new ApiError('بدهکار و بستانکار یک ردیف هم‌زمان مثبت نمی‌شوند.', 422);
      lines.push({
        position: i,
        productId,
        accountId,
        title: String(l.title || ref.name).slice(0, 2000),
        quantity: money(quantity),
        price: money(price),
        discount: money(discount),
        tax: money(tax),
        debit: money(debit),
        credit: money(credit),
        data: { productName: ref.name, productCode: ref.code },
      });
    }
    if (
      mod.kind &&
      mod.kind !== 'journal' &&
      new Set(lines.map((l) => l.productId)).size !== lines.length
    )
      throw new ApiError(
        'کالای تکراری را در یک ردیف با تعداد مجموع وارد کنید.',
        422,
        'DUPLICATE_PRODUCT',
      );
    if (data.exchangeRate !== undefined && D(data.exchangeRate).lte(0))
      throw new ApiError('نرخ ارز باید مثبت باشد.', 422);
    for (const bankKey of ['bankId', 'fromBankId', 'toBankId'])
      if (data[bankKey]) {
        const b = await tx.record.findUniqueOrThrow({ where: { id: data[bankKey] } });
        if (data.currency && (b.data as any).currency !== data.currency)
          throw new ApiError('ارز تراکنش و حساب باید یکسان باشد.', 422, 'CURRENCY_MISMATCH');
      }
    const total =
      mod.kind === 'invoice'
        ? invoiceTotal(data, lines).total
        : mod.kind === 'journal'
          ? lines.reduce((s, l) => s.add(D(l.debit)), D(0))
          : D(data.amount || 0);
    if (
      (mod.kind === 'journal' ||
        [
          'receipts',
          'payments',
          'expenses',
          'income',
          'transfers',
          'checks',
          'project-costs',
        ].includes(key)) &&
      total.lte(0)
    )
      throw new ApiError('مبلغ سند باید مثبت باشد.', 422);
    const code = String(
      data.code || old?.code || `${key.slice(0, 3).toUpperCase()}-${randomUUID().slice(0, 8)}`,
    );
    const rowData = {
      organizationId: s.organizationId,
      companyId: s.companyId,
      module: key,
      code,
      name: String(data.name || ''),
      status,
      date: key === 'fiscal-years' ? validDate(data.startDate) : date,
      branchId: key === 'branches' ? null : branchId,
      yearId: masters.has(key) ? null : s.yearId,
      data: json(data),
      total: money(total),
    };
    if (old) {
      await tx.recordLine.deleteMany({ where: { recordId: old.id } });
      await tx.recordReference.deleteMany({ where: { sourceId: old.id } });
    }
    let row = old
      ? await tx.record.update({
          where: { id: old.id },
          data: { ...rowData, version: { increment: 1 }, lines: { create: lines } },
          include: { lines: true },
        })
      : await tx.record.create({
          data: { ...rowData, lines: { create: lines } },
          include: { lines: true },
        });
    const refs = [
      ...mod.fields
        .filter((f) => f.ref && data[f.key])
        .map((f) => ({ field: f.key, targetId: String(data[f.key]) })),
      ...lines.map((l, i) => ({ field: `lines.${i}`, targetId: l.productId || l.accountId })),
      ...(data.originalInvoiceId
        ? [{ field: 'originalInvoiceId', targetId: String(data.originalInvoiceId) }]
        : []),
    ];
    if (refs.length)
      await tx.recordReference.createMany({
        skipDuplicates: true,
        data: refs.map((r) => ({ ...r, companyId: s.companyId, sourceId: row.id })),
      });
    if (postedStatus(key, status)) {
      await this.accounting.post(tx, p, s, row);
      if (key === 'checks' && status === 'وصول شده')
        await this.accounting.collectCheck(
          tx,
          p,
          s,
          await tx.record.findUniqueOrThrow({ where: { id: row.id } }),
        );
      if (key === 'payroll' && status === 'پرداخت شده')
        await this.accounting.payPayroll(
          tx,
          p,
          s,
          await tx.record.findUniqueOrThrow({ where: { id: row.id } }),
        );
    }
    if (!old && key === 'banks' && D(data.openingBalance || 0).gt(0)) {
      const y = await tx.record.findUniqueOrThrow({ where: { id: s.yearId } });
      await openYear(tx, s, validDate((y.data as any).startDate));
      const amount = D(data.openingBalance),
        value = amount.mul(D(data.exchangeRate || 1));
      await this.accounting.journal(
        tx,
        p,
        s,
        { ...row, date: validDate((y.data as any).startDate), yearId: s.yearId },
        [
          {
            system: 'cash',
            debit: value,
            credit: 0,
            bankId: row.id,
            currency: data.currency,
            foreignAmount: amount,
            exchangeRate: data.exchangeRate,
          },
          { system: 'equity', debit: 0, credit: value },
        ],
        'opening',
      );
    }
    if (!old && key === 'assets' && D(data.cost).gt(0)) {
      const y = await tx.record.findUniqueOrThrow({ where: { id: s.yearId } });
      await openYear(tx, s, validDate((y.data as any).startDate));
      await this.accounting.journal(
        tx,
        p,
        s,
        { ...row, date: validDate((y.data as any).startDate), yearId: s.yearId },
        [
          { system: 'assets', debit: data.cost, credit: 0 },
          { system: 'equity', debit: 0, credit: data.cost },
        ],
        'opening',
      );
    }
    await audit(
      tx,
      p,
      old ? 'record.update' : 'record.create',
      `${mod.singular} ${code} ذخیره شد`,
      s.companyId,
      row.id,
      old ? serializeRecord(old) : undefined,
      { code, status },
    );
    return serializeRecord(
      await tx.record.findUniqueOrThrow({ where: { id: row.id }, include: { lines: true } }),
    );
  }
  async remove(p: Principal, s: Scope, key: string, id: string) {
    requirePermission(p, `${key}.write`);
    return transaction(`org:${s.organizationId}`, async (tx) => {
      await requireSubscription(tx, p);
      if (['companies', 'users'].includes(key))
        throw new ApiError('برای حفظ سوابق از غیرفعال‌سازی استفاده کنید.', 422);
      const r = await tx.record.findFirst({ where: { ...recordWhere(s, key), id } });
      if (!r) throw new ApiError('رکورد یافت نشد.', 404);
      if (
        (await tx.journalLine.findFirst({
          where: { OR: [{ accountId: id }, { bankId: id }, { personId: id }, { projectId: id }] },
        })) ||
        (await tx.stockMovement.findFirst({
          where: { OR: [{ productId: id }, { warehouseId: id }] },
        }))
      )
        throw new ApiError('رکورد دارای گردش قطعی است.', 409, 'DEPENDENCIES_EXIST');
      if (
        r.postedAt ||
        (await tx.journal.findFirst({ where: { sourceId: r.id } })) ||
        (await tx.recordReference.findFirst({ where: { targetId: id } }))
      )
        throw new ApiError('رکورد دارای ثبت قطعی یا وابستگی است.', 409, 'DEPENDENCIES_EXIST');
      if (!masters.has(key)) await openYear(tx, s, r.date!);
      await tx.record.delete({ where: { id } });
      await audit(tx, p, 'record.delete', `${r.code} حذف شد`, s.companyId, id);
      return { ok: true };
    });
  }
  async action(p: Principal, s: Scope, key: string, id: string, action: string, input: any = {}) {
    requirePermission(p, `${key}.${action}`);
    return transaction(`org:${s.organizationId}`, async (tx) => {
      const sub = await requireSubscription(tx, p);
      const row = await tx.record.findFirst({
        where: { ...recordWhere(s, key), id },
        include: { lines: true },
      });
      if (!row) throw new ApiError('سند یافت نشد.', 404);
      if (input.version !== undefined && Number(input.version) !== row.version)
        throw new ApiError('نسخهٔ سند تغییر کرده است.', 409, 'VERSION_CONFLICT');
      if (action === 'post') {
        if (masters.has(key) || key === 'quotes')
          throw new ApiError('این بخش عملیات ثبت قطعی ندارد.', 422);
        if (row.postedAt) return serializeRecord(row);
        await this.accounting.post(tx, p, s, row);
        await tx.record.update({
          where: { id },
          data: {
            status:
              key === 'production' ? 'تکمیل شده' : key === 'checks' ? 'در جریان' : 'تأیید شده',
            version: { increment: 1 },
          },
        });
      } else if (action === 'reverse') {
        if (!input.reason || String(input.reason).trim().length < 3)
          throw new ApiError('دلیل برگشت را وارد کنید.', 422);
        await this.accounting.reverse(
          tx,
          p,
          s,
          row,
          input.date || new Date().toISOString().slice(0, 10),
        );
        await audit(tx, p, 'record.reverse.reason', String(input.reason), s.companyId, id);
      } else if (action === 'convert' && key === 'quotes') {
        const existing = await tx.record.findFirst({
          where: {
            companyId: s.companyId,
            module: 'sales',
            data: { path: ['quoteId'], equals: id },
          },
        });
        if (existing) return serializeRecord(existing);
        const created = await this.saveRecord(
          tx,
          p,
          s,
          'sales',
          {
            ...(row.data as any),
            code: `SALE-${randomUUID().slice(0, 8)}`,
            quoteId: id,
            status: 'پیش‌نویس',
            lines: serializeRecord(row).lines,
          },
          undefined,
          sub.plan.documentLimit,
        );
        await tx.record.update({
          where: { id: created.id },
          data: { data: json({ ...(row.data as any), ...created, quoteId: id }) },
        });
        return created;
      } else throw new ApiError('عملیات معتبر نیست.', 404);
      return serializeRecord(
        await tx.record.findUniqueOrThrow({ where: { id }, include: { lines: true } }),
      );
    });
  }
}
