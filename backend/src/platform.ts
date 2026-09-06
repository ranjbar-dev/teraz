import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  db,
  D,
  money,
  ApiError,
  Principal,
  transaction,
  passwordHash,
  audit,
  requirePermission,
  json,
} from './core';
import { createOrganization } from './provision';
const planInput = z.object({
  name: z.string().trim().min(2).max(100),
  price: z
    .union([z.string(), z.number()])
    .transform(String)
    .refine((v) => /^\d+$/.test(v) && D(v).lte('9000000000000000')),
  durationDays: z.coerce.number().int().min(1).max(3660),
  companyLimit: z.coerce.number().int().min(1).max(1000),
  userLimit: z.coerce.number().int().min(1).max(10000),
  documentLimit: z.coerce.number().int().min(1).max(1000000),
  active: z.boolean().default(true),
});
export class PlatformService {
  guard(p: Principal) {
    if (!p.superAdmin) throw new ApiError('دسترسی مدیر کل لازم است.', 403, 'PLATFORM_FORBIDDEN');
  }
  async overview(p: Principal) {
    this.guard(p);
    const [organizations, plans, userCount, verifiedPayments, auditRows] = await Promise.all([
      db.organization.findMany({
        include: {
          subscription: { include: { plan: true } },
          _count: { select: { companies: true, memberships: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.plan.findMany({ orderBy: { price: 'asc' } }),
      db.user.count(),
      db.billingPayment.aggregate({ where: { status: 'VERIFIED' }, _sum: { amount: true } }),
      db.auditEvent.findMany({
        where: { action: { startsWith: 'platform.' } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      organizations,
      plans,
      stats: {
        organizations: organizations.length,
        active: organizations.filter(
          (o) => o.status === 'ACTIVE' && o.subscription && o.subscription.endsAt > new Date(),
        ).length,
        users: userCount,
        verifiedPayments: money(verifiedPayments._sum.amount || 0),
      },
      audit: auditRows,
    };
  }
  async savePlan(p: Principal, input: any, id?: string) {
    this.guard(p);
    const parsed = planInput.safeParse(input);
    if (!parsed.success) throw new ApiError('مقادیر پلن معتبر نیست.', 422);
    return transaction('platform:plans', async (tx) => {
      const v = parsed.data;
      const result = id
        ? await tx.plan.update({ where: { id }, data: v })
        : await tx.plan.create({ data: v });
      await audit(
        tx,
        p,
        'platform.plan',
        'پلن اشتراک ذخیره شد',
        undefined,
        result.id,
        undefined,
        v,
      );
      return result;
    });
  }
  async create(p: Principal, input: any) {
    this.guard(p);
    const parsed = z
      .object({
        name: z.string().trim().min(2).max(150),
        slug: z
          .string()
          .min(3)
          .max(50)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        ownerName: z.string().trim().min(2).max(100),
        ownerEmail: z.email().max(200),
        planId: z.uuid(),
        days: z.coerce.number().int().min(1).max(3660).default(30),
      })
      .safeParse(input);
    if (!parsed.success) throw new ApiError('اطلاعات سازمان و مدیر آن معتبر نیست.', 422);
    const v = parsed.data,
      temporaryPassword = randomBytes(18).toString('base64url'),
      ph = await passwordHash(temporaryPassword);
    return transaction('platform:organizations', async (tx) => {
      if (await tx.user.findUnique({ where: { email: v.ownerEmail.toLowerCase() } }))
        throw new ApiError('برای حساب موجود از دعوت سازمان استفاده کنید.', 409);
      if (await tx.organization.findUnique({ where: { slug: v.slug } }))
        throw new ApiError('نشانی سازمان تکراری است.', 409);
      const owner = await tx.user.create({
        data: { email: v.ownerEmail.toLowerCase(), name: v.ownerName, passwordHash: ph },
      });
      const org = await createOrganization(tx, {
        name: v.name,
        slug: v.slug,
        ownerId: owner.id,
        planId: v.planId,
        trialDays: v.days,
      });
      await tx.subscription.update({
        where: { organizationId: org.id },
        data: { status: 'ACTIVE' },
      });
      await audit(
        tx,
        p,
        'platform.organization.create',
        'سازمان و مدیر اولیه ساخته شد',
        undefined,
        org.id,
        undefined,
        { name: v.name, ownerEmail: v.ownerEmail, planId: v.planId, days: v.days },
      );
      return {
        organization: org,
        owner: { email: owner.email, temporaryPassword },
        loginUrl: '/login',
      };
    });
  }
  async update(p: Principal, id: string, input: any) {
    this.guard(p);
    return transaction(`org:${id}`, async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id },
        include: { subscription: true },
      });
      if (!org) throw new ApiError('سازمان یافت نشد.', 404);
      if (input.status && !['ACTIVE', 'SUSPENDED'].includes(input.status))
        throw new ApiError('وضعیت معتبر نیست.', 422);
      if (input.status)
        await tx.organization.update({ where: { id }, data: { status: input.status } });
      if (input.planId || input.days || input.subscriptionStatus) {
        if (
          input.subscriptionStatus &&
          !['ACTIVE', 'SUSPENDED', 'TRIAL', 'CANCELLED'].includes(input.subscriptionStatus)
        )
          throw new ApiError('وضعیت اشتراک معتبر نیست.', 422);
        const planId = String(input.planId || org.subscription?.planId || '');
        if (!(await tx.plan.findUnique({ where: { id: planId } })))
          throw new ApiError('پلن معتبر نیست.', 422);
        const days = Number(input.days || 0);
        if (!Number.isInteger(days) || days < 0 || days > 3660)
          throw new ApiError('مدت تمدید معتبر نیست.', 422);
        const endsAt = new Date(
          Math.max(Date.now(), org.subscription?.endsAt.getTime() || 0) + days * 86400000,
        );
        await tx.subscription.upsert({
          where: { organizationId: id },
          create: {
            organizationId: id,
            planId,
            status: input.subscriptionStatus || 'ACTIVE',
            endsAt,
          },
          update: {
            planId,
            status: input.subscriptionStatus || org.subscription?.status || 'ACTIVE',
            ...(days ? { endsAt } : {}),
          },
        });
      }
      await audit(
        tx,
        p,
        'platform.organization.update',
        'وضعیت یا اشتراک سازمان تغییر کرد',
        undefined,
        id,
        { status: org.status, subscription: org.subscription },
        {
          status: input.status,
          planId: input.planId,
          days: input.days,
          subscriptionStatus: input.subscriptionStatus,
        },
      );
      return { ok: true };
    });
  }
}
export type PaymentTransport = (
  method: 'request' | 'verify',
  payload: Record<string, unknown>,
) => Promise<any>;
export class BillingService {
  constructor(
    private transport: PaymentTransport = async (method, payload) => {
      const res = await fetch(`https://sandbox.zarinpal.com/pg/v4/payment/${method}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      const body = await res.json();
      if (!res.ok)
        throw new ApiError('ارتباط با زرین‌پال آزمایشی ناموفق بود.', 502, 'PAYMENT_PROVIDER_ERROR');
      return body;
    },
  ) {}
  async plans() {
    return db.plan.findMany({ where: { active: true }, orderBy: { price: 'asc' } });
  }
  async status(p: Principal) {
    requirePermission(p, 'subscription.read');
    return {
      subscription: await db.subscription.findUnique({
        where: { organizationId: p.organizationId! },
        include: { plan: true },
      }),
      organization: await db.organization.findUnique({ where: { id: p.organizationId! } }),
      plans: await this.plans(),
      payments: await db.billingPayment.findMany({
        where: { organizationId: p.organizationId! },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      mode: 'sandbox',
    };
  }
  async checkout(p: Principal, input: any) {
    requirePermission(p, 'subscription.write');
    const plan = await db.plan.findFirst({
      where: { id: String(input.planId || ''), active: true },
    });
    if (!plan || D(plan.price).lte(0)) throw new ApiError('پلن قابل پرداخت نیست.', 422);
    if (D(plan.price).gt(Number.MAX_SAFE_INTEGER))
      throw new ApiError('مبلغ خارج از محدودهٔ درگاه است.', 422);
    const payment = await db.billingPayment.create({
      data: {
        organizationId: p.organizationId!,
        planId: plan.id,
        amount: plan.price,
        durationDays: plan.durationDays,
        mode: 'sandbox',
      },
    });
    try {
      const response = await this.transport('request', {
        merchant_id: this.merchant(),
        amount: Number(plan.price),
        currency: 'IRR',
        description: `اشتراک ${plan.name}`,
        callback_url: `${process.env.WEB_ORIGIN}/api/billing/callback`,
        metadata: { order_id: payment.id, email: p.email },
      });
      const authority = String(response.data?.authority || '');
      if (response.data?.code !== 100 || !/^S[a-zA-Z0-9]{10,100}$/.test(authority))
        throw new ApiError('درخواست پرداخت آزمایشی پذیرفته نشد.', 502, 'PAYMENT_REJECTED');
      await db.billingPayment.update({ where: { id: payment.id }, data: { authority } });
      return {
        paymentId: payment.id,
        url: `https://sandbox.zarinpal.com/pg/StartPay/${authority}`,
        mode: 'sandbox',
      };
    } catch (e) {
      await db.billingPayment.update({
        where: { id: payment.id },
        data: { status: 'REQUEST_FAILED' },
      });
      throw e;
    }
  }
  merchant() {
    const id = process.env.ZARINPAL_MERCHANT_ID || 'a8f213d0-3b2c-48d0-a9fb-81aacdd3b530';
    if (!z.uuid().safeParse(id).success)
      throw new ApiError('شناسهٔ آزمایشی زرین‌پال معتبر نیست.', 503);
    return id;
  }
  async verify(authority: string, status: string) {
    if (!/^S[a-zA-Z0-9]{10,100}$/.test(authority))
      throw new ApiError('شناسهٔ پرداخت معتبر نیست.', 422);
    const payment = await db.billingPayment.findUnique({ where: { authority } });
    if (!payment) throw new ApiError('پرداخت یافت نشد.', 404);
    if (payment.status === 'VERIFIED') return { ok: true, reference: payment.reference };
    if (status !== 'OK') return { ok: false };
    const response = await this.transport('verify', {
      merchant_id: this.merchant(),
      amount: Number(payment.amount),
      authority,
    });
    if (![100, 101].includes(response.data?.code) || !response.data?.ref_id)
      throw new ApiError('پرداخت توسط درگاه تأیید نشد.', 422, 'PAYMENT_NOT_VERIFIED');
    return transaction(`org:${payment.organizationId}`, async (tx) => {
      const current = await tx.billingPayment.findUniqueOrThrow({ where: { id: payment.id } });
      if (current.status === 'VERIFIED') return { ok: true, reference: current.reference };
      const subscription = await tx.subscription.findUnique({
        where: { organizationId: payment.organizationId },
      });
      const endsAt = new Date(
        Math.max(Date.now(), subscription?.endsAt.getTime() || 0) + payment.durationDays * 86400000,
      );
      await tx.subscription.upsert({
        where: { organizationId: payment.organizationId },
        create: {
          organizationId: payment.organizationId,
          planId: payment.planId,
          status: 'ACTIVE',
          endsAt,
        },
        update: { planId: payment.planId, status: 'ACTIVE', endsAt },
      });
      const reference = String(response.data.ref_id);
      await tx.billingPayment.update({
        where: { id: payment.id },
        data: { status: 'VERIFIED', reference, verifiedAt: new Date() },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: payment.organizationId,
          userId: 'system',
          userName: 'زرین‌پال آزمایشی',
          action: 'subscription.payment',
          targetId: payment.id,
          message: 'پرداخت آزمایشی تأیید و اشتراک تمدید شد',
          after: json({ reference, amount: money(payment.amount), endsAt }),
        },
      });
      return { ok: true, reference };
    });
  }
}
