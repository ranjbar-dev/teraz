import { Request } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  db,
  hash,
  passwordHash,
  passwordMatches,
  ApiError,
  Principal,
  transaction,
  json,
  audit,
  roleLabel,
} from './core';
import { createOrganization } from './provision';
const registration = z.object({
  name: z.string().trim().min(2).max(100),
  email: z
    .email()
    .max(200)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(128),
  organizationName: z.string().trim().min(2).max(150),
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
export class AuthService {
  async rateLimit(key: string, limit = 10, seconds = 900) {
    const now = new Date();
    const rows = await db.$queryRaw<
      { count: number }[]
    >`INSERT INTO "RateBucket" ("key","count","resetsAt") VALUES (${key},1,${new Date(Date.now() + seconds * 1000)}) ON CONFLICT ("key") DO UPDATE SET "count"=CASE WHEN "RateBucket"."resetsAt" < ${now} THEN 1 ELSE "RateBucket"."count"+1 END, "resetsAt"=CASE WHEN "RateBucket"."resetsAt" < ${now} THEN ${new Date(Date.now() + seconds * 1000)} ELSE "RateBucket"."resetsAt" END RETURNING "count"`;
    if (rows[0].count > limit)
      throw new ApiError('تعداد تلاش‌ها زیاد است. کمی بعد دوباره تلاش کنید.', 429, 'RATE_LIMIT');
  }
  async login(input: any, ip: string) {
    await this.rateLimit('login:' + ip, 30);
    const email = String(input.email || '')
      .trim()
      .toLowerCase();
    await this.rateLimit('login-email:' + hash(email), 12);
    const user = await db.user.findUnique({
      where: { email },
      include: { memberships: { where: { active: true }, include: { organization: true } } },
    });
    if (
      !user ||
      !user.active ||
      !(await passwordMatches(String(input.password || ''), user.passwordHash))
    )
      throw new ApiError('ایمیل یا رمز عبور اشتباه است.', 401, 'INVALID_CREDENTIALS');
    const organizationId =
      user.globalRole === 'SUPER_ADMIN' ? null : user.memberships[0]?.organizationId;
    if (!organizationId && user.globalRole !== 'SUPER_ADMIN')
      throw new ApiError('عضویت فعالی برای این حساب وجود ندارد.', 403, 'NO_MEMBERSHIP');
    return this.session(user.id, organizationId || null, user.globalRole === 'SUPER_ADMIN');
  }
  async register(input: any, ip: string) {
    await this.rateLimit('register:' + ip, 8, 3600);
    const parsed = registration.safeParse(input);
    if (!parsed.success)
      throw new ApiError(
        'اطلاعات ثبت‌نام معتبر نیست؛ رمز حداقل ۱۲ نویسه و نشانی سازمان با حروف لاتین باشد.',
        422,
        'INVALID_REGISTRATION',
      );
    const v = parsed.data;
    const ph = await passwordHash(v.password);
    const result = await transaction('register:' + v.email, async (tx) => {
      if (await tx.user.findUnique({ where: { email: v.email } }))
        throw new ApiError('این ایمیل قبلاً ثبت شده است.', 409, 'EMAIL_EXISTS');
      if (await tx.organization.findUnique({ where: { slug: v.slug } }))
        throw new ApiError('نشانی سازمان قبلاً استفاده شده است.', 409, 'SLUG_EXISTS');
      const user = await tx.user.create({
        data: { email: v.email, name: v.name, passwordHash: ph },
      });
      const org = await createOrganization(tx, {
        name: v.organizationName,
        slug: v.slug,
        ownerId: user.id,
      });
      await tx.auditEvent.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          userName: user.name,
          action: 'organization.register',
          targetId: org.id,
          message: 'سازمان ثبت‌نام شد',
        },
      });
      return { user, org };
    });
    return this.session(result.user.id, result.org.id, false);
  }
  async session(userId: string, organizationId: string | null, superAdmin: boolean) {
    const token = randomBytes(32).toString('base64url');
    await db.session.create({
      data: {
        userId,
        organizationId,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + (superAdmin ? 8 : 24) * 3600000),
      },
    });
    return { token, redirect: superAdmin ? '/platform' : '/dashboard' };
  }
  async principal(req: Request): Promise<Principal> {
    const token =
      String(req.headers.cookie || '')
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith('taraz-session='))
        ?.slice(14) || '';
    if (!token) throw new ApiError('برای ادامه وارد حساب شوید.', 401, 'UNAUTHENTICATED');
    const session = await db.session.findUnique({
      where: { tokenHash: hash(token) },
      include: { user: { include: { memberships: { where: { active: true } } } } },
    });
    if (!session || session.expiresAt < new Date() || !session.user.active)
      throw new ApiError('نشست منقضی شده است.', 401, 'SESSION_EXPIRED');
    const superAdmin = session.user.globalRole === 'SUPER_ADMIN';
    const member = session.user.memberships.find(
      (m) => m.organizationId === session.organizationId,
    );
    if (!superAdmin && !member)
      throw new ApiError('دسترسی سازمان غیرفعال است.', 403, 'NO_MEMBERSHIP');
    return {
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      superAdmin,
      organizationId: session.organizationId,
      role: member?.role || 'SUPER_ADMIN',
      companyIds: (member?.companyIds || []) as string[],
      permissions: (member?.permissions || []) as string[],
      sessionId: session.id,
    };
  }
  async me(p: Principal) {
    return {
      user: {
        id: p.userId,
        name: p.name,
        email: p.email,
        role: roleLabel(p.role),
        superAdmin: p.superAdmin,
      },
      organizationId: p.organizationId,
      organizations: await db.membership.findMany({
        where: { userId: p.userId, active: true },
        select: {
          role: true,
          organization: { select: { id: true, name: true, slug: true, status: true } },
        },
      }),
    };
  }
  async switchOrganization(p: Principal, id: string) {
    if (
      !(await db.membership.findFirst({
        where: { userId: p.userId, organizationId: id, active: true },
      }))
    )
      throw new ApiError('عضویت سازمان معتبر نیست.', 403, 'FORBIDDEN');
    await db.session.update({ where: { id: p.sessionId }, data: { organizationId: id } });
    return { ok: true };
  }
  async logout(p: Principal) {
    await db.session.delete({ where: { id: p.sessionId } });
    return { ok: true };
  }
  async changePassword(p: Principal, input: any) {
    const user = await db.user.findUniqueOrThrow({ where: { id: p.userId } });
    if (!(await passwordMatches(String(input.currentPassword || ''), user.passwordHash)))
      throw new ApiError('رمز فعلی صحیح نیست.', 422);
    const ph = await passwordHash(String(input.password || ''));
    await transaction('user:' + p.userId, async (tx) => {
      await tx.user.update({ where: { id: p.userId }, data: { passwordHash: ph } });
      await tx.session.deleteMany({ where: { userId: p.userId, id: { not: p.sessionId } } });
      await audit(tx, p, 'auth.password', 'رمز عبور تغییر کرد');
    });
    return { ok: true };
  }
}
