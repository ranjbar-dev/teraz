import 'reflect-metadata';
import { Module, Controller, All, Req, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Request, Response, json as bodyJson } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import {
  db,
  ApiError,
  scopeFor,
  modules,
  masters,
  requirePermission,
  requireSubscription,
  transaction,
  json,
  audit,
  roleLabel,
  D,
} from './core';
import { AuthService } from './auth';
import { IdentityService } from './identity';
import { RecordsService } from './records';
import { ReportsService } from './reports';
import { PlatformService, BillingService } from './platform';
import { PayrollService } from './payroll';
import { PeriodService } from './periods';
import { IntegrationService, runWorker } from './integrations';
import { FilesService } from './files';
@Controller('api')
class ApiController {
  auth = new AuthService();
  identity = new IdentityService();
  records = new RecordsService();
  reports = new ReportsService();
  platform = new PlatformService();
  billing = new BillingService();
  payroll = new PayrollService();
  periods = new PeriodService();
  integrations = new IntegrationService();
  files = new FilesService();
  @All('{*path}')
  async handle(@Req() req: Request, @Res() res: Response) {
    const requestId = randomUUID();
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [key, id, action] = req.path.replace(/^\/api\/?/, '').split('/'),
        method = req.method,
        input = req.body || {},
        q = req.query as Record<string, any>;
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
        const origin = req.headers.origin;
        if (origin && origin !== process.env.WEB_ORIGIN)
          throw new ApiError('مبدأ درخواست مجاز نیست.', 403, 'INVALID_ORIGIN');
        if (method !== 'DELETE' && !req.is('application/json'))
          throw new ApiError('نوع درخواست باید JSON باشد.', 415);
      }
      if (key === 'health') {
        await db.$queryRaw`SELECT 1`;
        return res.json({ ok: true, database: 'postgresql', mode: process.env.NODE_ENV || 'development', version: '1.0.0' });
      }
      if (key === 'plans' && method === 'GET')
        return res.json({ rows: await this.billing.plans() });
      if (key === 'auth' && method === 'POST' && (!id || ['login', 'register'].includes(id))) {
        const result =
          id === 'register'
            ? await this.auth.register(input, req.ip || 'unknown')
            : await this.auth.login(input, req.ip || 'unknown');
        res.cookie('taraz-session', result.token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.COOKIE_SECURE === 'true',
          path: '/',
          maxAge: (result.redirect === '/platform' ? 8 : 24) * 3600000,
        });
        return res.json({ ok: true, redirect: result.redirect });
      }
      if (key === 'auth' && id === 'forgot' && method === 'POST')
        return res.json(await this.identity.forgot(input, req.ip || 'unknown'));
      if (key === 'auth' && id === 'reset' && method === 'POST')
        return res.json(await this.identity.reset(input, req.ip || 'unknown'));
      if (key === 'auth' && id === 'verify-email' && method === 'POST')
        return res.json(await this.identity.verifyEmail(input, req.ip || 'unknown'));
      if (key === 'billing' && id === 'callback' && method === 'GET') {
        await this.auth.rateLimit('callback:' + req.ip, 60, 60);
        try {
          const result = await this.billing.verify(
            String(q.Authority || ''),
            String(q.Status || ''),
          );
          return res.redirect(
            303,
            `${process.env.WEB_ORIGIN}/subscription?payment=${result.ok ? 'verified' : 'cancelled'}`,
          );
        } catch (e) {
          if (e instanceof ApiError)
            return res.redirect(303, `${process.env.WEB_ORIGIN}/subscription?payment=failed`);
          throw e;
        }
      }
      const p = await this.auth.principal(req);
      if (key === 'local-mail' && method === 'GET') return res.json(await this.identity.inbox(p));
      if (key === 'auth' && id === 'request-verification' && method === 'POST')
        return res.json(await this.identity.requestVerification(p));
      if (key === 'billing' && id === 'local' && action) {
        if (method === 'GET') return res.json(await this.billing.localPayment(p, action));
        if (method === 'POST') return res.json(await this.billing.localDecision(p, action, input));
      }
      if (key === 'auth') {
        if (method === 'DELETE') {
          await this.auth.logout(p);
          res.clearCookie('taraz-session', { path: '/' });
          return res.json({ ok: true });
        }
        if (id === 'password' && method === 'POST')
          return res.json(await this.auth.changePassword(p, input));
        if (id === 'switch' && method === 'POST')
          return res.json(await this.auth.switchOrganization(p, String(input.organizationId)));
        if (method === 'GET') return res.json(await this.auth.me(p));
      }
      if (key === 'invitations' && method === 'POST')
        return res.json(
          id === 'accept'
            ? await this.identity.accept(p, input)
            : await this.identity.invite(p, input),
        );
      if (key === 'platform') {
        this.platform.guard(p);
        if (method === 'GET' && !id) return res.json(await this.platform.overview(p));
        if (id === 'plans' && ['POST', 'PATCH'].includes(method))
          return res.json(await this.platform.savePlan(p, input, action));
        if (id === 'organizations' && method === 'POST')
          return res.status(201).json(await this.platform.create(p, input));
        if (id === 'organizations' && action && method === 'PATCH')
          return res.json(await this.platform.update(p, action, input));
        throw new ApiError('مسیر مدیریت یافت نشد.', 404);
      }
      if (key === 'subscription' && method === 'GET') return res.json(await this.billing.status(p));
      if (key === 'billing' && id === 'checkout' && method === 'POST')
        return res.json(await this.billing.checkout(p, input));
      const org = await db.organization.findUnique({
        where: { id: p.organizationId || '00000000-0000-0000-0000-000000000000' },
      });
      if (!org || org.status !== 'ACTIVE')
        throw new ApiError(
          p.superAdmin ? 'از پنل مدیر کل استفاده کنید.' : 'سازمان تعلیق شده است.',
          403,
          p.superAdmin ? 'PLATFORM_REDIRECT' : 'ORGANIZATION_SUSPENDED',
        );
      const s = await scopeFor(p, q);
      if (key === 'bootstrap' && method === 'GET') {
        const company = await db.company.findUniqueOrThrow({ where: { id: s.companyId } });
        const lookups: Record<string, any[]> = {};
        const records = await db.record.findMany({
          where: {
            companyId: s.companyId,
            OR: [{ module: { in: [...masters] } }, { yearId: s.yearId }],
          },
          include: { lines: { orderBy: { position: 'asc' } } },
        });
        const { serializeRecord } = await import('./core');
        for (const m of modules)
          if (m.key !== 'users')
            lookups[m.key] = records.filter((r) => r.module === m.key).map(serializeRecord);
        const companies = await db.company.findMany({
          where: {
            organizationId: s.organizationId,
            ...(!['OWNER', 'ADMIN'].includes(p.role) && p.companyIds.length
              ? { id: { in: p.companyIds } }
              : {}),
          },
        });
        return res.json({
          ...(await this.auth.me(p)),
          scope: s,
          companies,
          branches: lookups.branches,
          years: lookups['fiscal-years'],
          settings: {
            ...(company.settings as any),
            baseCurrency: company.baseCurrency,
            currency: ({ IRR: 'ریال', IRT: 'تومان', USD: 'دلار', EUR: 'یورو', AED: 'درهم' } as any)[
              company.baseCurrency
            ],
          },
          lookups,
          subscription: await db.subscription.findUnique({
            where: { organizationId: s.organizationId },
            include: { plan: true },
          }),
        });
      }
      if (key === 'dashboard' && method === 'GET')
        return res.json(await this.reports.dashboard(p, s, Number(q.months)));
      if (key === 'reports' && method === 'GET')
        return res.json(await this.reports.report(p, s, id, q));
      if (key === 'activity' && method === 'GET') {
        requirePermission(p, 'activity.read');
        const rows = await db.auditEvent.findMany({
          where: { companyId: s.companyId, organizationId: s.organizationId },
          orderBy: { createdAt: 'desc' },
          take: 1000,
        });
        return res.json({
          rows: rows.map((a) => ({ ...a, date: a.createdAt.toISOString(), user: a.userName })),
        });
      }
      if (key === 'settings') {
        requirePermission(p, `settings.${method === 'GET' ? 'read' : 'write'}`);
        if (method === 'GET')
          return res.json(
            (await db.company.findUniqueOrThrow({ where: { id: s.companyId } })).settings,
          );
        if (method === 'PATCH')
          return res.json(
            await transaction(`org:${s.organizationId}`, async (tx) => {
              await requireSubscription(tx, p);
              const c = await tx.company.findUniqueOrThrow({ where: { id: s.companyId } }),
                v = { ...(c.settings as any) };
              for (const k of [
                'taxRate',
                'invoicePrefix',
                'paymentTerms',
                'address',
                'phone',
                'invoiceNote',
                'calendar',
                'digits',
                'lowStock',
              ])
                if (input[k] !== undefined) v[k] = String(input[k]).slice(0, 1000);
              if (D(v.taxRate).lt(0) || D(v.taxRate).gt(100) || D(v.paymentTerms).lt(0))
                throw new ApiError('تنظیمات عددی معتبر نیست.', 422);
              await tx.company.update({ where: { id: c.id }, data: { settings: json(v) } });
              await audit(tx, p, 'settings.write', 'تنظیمات ذخیره شد', s.companyId);
              return v;
            }),
          );
      }
      if (key === 'payroll-rules') {
        if (method === 'GET') return res.json(await this.payroll.list(p, s));
        if (method === 'POST') return res.json(await this.payroll.save(p, s, input));
      }
      if (key === 'payroll-calculate' && method === 'POST')
        return res.json(await this.payroll.preview(p, s, input));
      if (key === 'payroll-exports' && method === 'GET')
        return res.json(await this.payroll.exportRows(p, s, q));
      if (key === 'period-close' && method === 'POST')
        return res.json(await this.periods.close(p, s, input));
      if (key === 'integrations') {
        if (method === 'GET') return res.json(await this.integrations.list(p, s));
        if (method === 'PATCH') return res.json(await this.integrations.configure(p, s, id, input));
        if (method === 'POST' && action === 'retry')
          return res.json(await this.integrations.retry(p, s, id, input));
        if (method === 'POST') return res.json(await this.integrations.enqueue(p, s, id, input));
      }
      if (key === 'attachments') {
        if (method === 'GET' && id) return this.files.download(p, s, id, res);
        if (method === 'GET')
          return res.json(await this.files.list(p, s, String(q.recordId || '')));
        if (method === 'POST') return res.status(201).json(await this.files.upload(p, s, input));
        if (method === 'DELETE') return res.json(await this.files.remove(p, s, id));
      }
      if (!modules.some((m) => m.key === key)) throw new ApiError('مسیر یافت نشد.', 404);
      if (method === 'GET')
        return res.json(
          id ? await this.records.get(p, s, key, id) : await this.records.list(p, s, key, q),
        );
      if (method === 'POST' && id && action)
        return res.json(await this.records.action(p, s, key, id, action, input));
      if (method === 'POST' && !id)
        return res
          .status(201)
          .json(
            await this.records.write(
              p,
              s,
              key,
              input,
              undefined,
              String(req.headers['idempotency-key'] || '') || undefined,
            ),
          );
      if (method === 'PATCH' && id)
        return res.json(
          await this.records.write(
            p,
            s,
            key,
            input,
            id,
            String(req.headers['idempotency-key'] || '') || undefined,
          ),
        );
      if (method === 'DELETE' && id) return res.json(await this.records.remove(p, s, key, id));
      throw new ApiError('روش مجاز نیست.', 405);
    } catch (e) {
      if (e instanceof ApiError)
        return res
          .status(e.status)
          .json({ error: e.message, code: e.code, fieldErrors: e.fieldErrors, requestId });
      const code = (e as any)?.code;
      if (['P2002', 'P2003'].includes(code))
        return res.status(409).json({
          error:
            code === 'P2002'
              ? 'مقدار تکراری است؛ دادهٔ دیگری با همین مشخصات وجود دارد.'
              : 'رکورد وابسته یا مرجع نامعتبر است.',
          code,
          requestId,
        });
      if (['P2023', 'P2025'].includes(code))
        return res
          .status(404)
          .json({ error: 'شناسه معتبر نیست یا رکورد یافت نشد.', code, requestId });
      console.error(
        JSON.stringify({ requestId, error: e instanceof Error ? e.name : 'UnknownError', code }),
      );
      return res.status(500).json({
        error: 'پردازش انجام نشد. شناسهٔ پیگیری را به پشتیبانی بدهید.',
        code: 'INTERNAL_ERROR',
        requestId,
      });
    }
  }
}
@Module({ controllers: [ApiController] })
class ApiModule {}
async function main() {
  if (!process.env.DATABASE_URL || !process.env.ENCRYPTION_KEY)
    throw new Error('Run local setup first; DATABASE_URL and ENCRYPTION_KEY are required.');
  const app = await NestFactory.create(ApiModule, { bodyParser: false });
  // Production API traffic comes directly from the private Caddy network.
  if (process.env.TRUST_PROXY === 'true') app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(helmet());
  app.use(bodyJson({ limit: '8mb' }));
  const config = new DocumentBuilder()
    .setTitle('Taraz Accounting API')
    .setVersion('1.0.0')
    .setDescription(
      'Same-origin session API. Money is a decimal string. All accounting writes require an active organization subscription. Use companyId, branchId and yearId scope query parameters. Posted documents are immutable.',
    )
    .addCookieAuth('taraz-session')
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  for (const m of modules) {
    doc.paths[`/api/${m.key}`] = {
      get: {
        summary: m.title,
        security: [{ cookie: [] }],
        parameters: [
          { name: 'companyId', in: 'query', schema: { type: 'string' } },
          { name: 'yearId', in: 'query', schema: { type: 'string' } },
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'filters', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: '{ rows, totalCount, page, limit }' } },
      },
      post: {
        summary: `ساخت ${m.singular}`,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: Object.fromEntries(
                  m.fields.map((f) => [f.key, { type: 'string', description: f.label }]),
                ),
              },
            },
          },
        },
        responses: { 201: { description: 'Created' }, 422: { description: 'Validation error' } },
      },
    };
  }
  SwaggerModule.setup('docs', app, doc, { jsonDocumentUrl: 'docs/json' });
  await db.$connect();
  const host = process.env.API_HOST || '127.0.0.1';
  await app.listen(Number(process.env.API_PORT || 4000), host);
  const stopWorker = runWorker();
  app.enableShutdownHooks();
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      stopWorker();
      void app
        .close()
        .then(() => db.$disconnect())
        .then(() => process.exit(0));
    });
  console.log(`Taraz API listening at http://${host}:${process.env.API_PORT || 4000}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
