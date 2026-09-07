import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  db,
  hash,
  passwordHash,
  ApiError,
  Principal,
  transaction,
  requirePermission,
  requireSubscription,
  audit,
} from './core';
import { AuthService } from './auth';
import { requireLocalMode } from './local-mode';
export async function localNotification(email: string, kind: string, token: string) {
  if (process.env.NODE_ENV === 'production')
    throw new ApiError(
      'ارائه‌دهندهٔ ارسال ایمیل تولید تنظیم نشده است.',
      503,
      'MAIL_PROVIDER_REQUIRED',
    );
  const dir = path.resolve(__dirname, '../../.runtime/mail');
  await mkdir(dir, { recursive: true });
  const url = `${process.env.WEB_ORIGIN}/${kind}?token=${token}`;
  await db.localMail.create({ data: { email, kind, url } });
  await writeFile(
    path.join(dir, `${Date.now()}-${randomBytes(4).toString('hex')}.json`),
    JSON.stringify({ to: email, kind, url, mode: 'local-outbox' }, null, 2),
    { mode: 0o600 },
  );
}
export class IdentityService {
  async tour(p: Principal, seen = false) {
    if (p.organizationId) {
      const where = {
        organizationId_userId: { organizationId: p.organizationId, userId: p.userId },
      };
      const membership = await db.membership.findUnique({ where });
      if (!membership?.active) throw new ApiError('عضویت فعال لازم است.', 403);
      if (seen && !membership.tourSeenAt)
        await db.membership.updateMany({
          where: { id: membership.id, tourSeenAt: null },
          data: { tourSeenAt: new Date() },
        });
      return { seen: seen || !!membership.tourSeenAt };
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: p.userId } });
    if (seen && !user.tourSeenAt)
      await db.user.updateMany({
        where: { id: p.userId, tourSeenAt: null },
        data: { tourSeenAt: new Date() },
      });
    return { seen: seen || !!user.tourSeenAt };
  }
  async inbox(p: Principal) {
    requireLocalMode();
    return {
      mode: 'local',
      superAdmin: p.superAdmin,
      rows: await db.localMail.findMany({
        where: p.superAdmin ? {} : { email: p.email },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  }
  async requestVerification(p: Principal) {
    await new AuthService().rateLimit('verify-email:' + p.userId, 5, 3600);
    const user = await db.user.findUniqueOrThrow({ where: { id: p.userId } });
    if (user.emailVerifiedAt) return { ok: true, verified: true };
    const token = randomBytes(32).toString('base64url');
    await db.emailVerification.create({
      data: {
        userId: p.userId,
        email: user.email,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
    await localNotification(user.email, 'verify-email', token);
    return { ok: true, verified: false, mode: 'local-outbox' };
  }
  async verifyEmail(input: any, ip: string) {
    await new AuthService().rateLimit('verify-token:' + ip, 20, 900);
    return transaction('verify-email:' + hash(String(input.token)), async (tx) => {
      const record = await tx.emailVerification.findUnique({
        where: { tokenHash: hash(String(input.token || '')) },
      });
      if (!record || record.usedAt || record.expiresAt < new Date())
        throw new ApiError('پیوند تأیید نامعتبر یا منقضی است.', 422);
      const user = await tx.user.findUniqueOrThrow({ where: { id: record.userId } });
      if (user.email !== record.email) throw new ApiError('ایمیل حساب تغییر کرده است.', 422);
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await tx.emailVerification.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      return { ok: true };
    });
  }
  async forgot(input: any, ip: string) {
    await new AuthService().rateLimit('forgot:' + ip, 6, 3600);
    const user = await db.user.findUnique({
      where: {
        email: String(input.email || '')
          .trim()
          .toLowerCase(),
      },
    });
    if (user?.active) {
      const token = randomBytes(32).toString('base64url');
      await db.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      await localNotification(user.email, 'reset-password', token);
    }
    return {
      ok: true,
      message:
        'اگر حسابی وجود داشته باشد، راهنمای بازیابی آماده می‌شود. در اجرای محلی صندوق خروجی سرور را بررسی کنید.',
    };
  }
  async reset(input: any, ip: string) {
    await new AuthService().rateLimit('reset:' + ip, 12);
    const ph = await passwordHash(String(input.password || ''));
    return transaction('reset:' + hash(String(input.token)), async (tx) => {
      const reset = await tx.passwordReset.findUnique({
        where: { tokenHash: hash(String(input.token || '')) },
      });
      if (!reset || reset.usedAt || reset.expiresAt < new Date())
        throw new ApiError('پیوند بازیابی نامعتبر یا منقضی است.', 422);
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash: ph } });
      await tx.passwordReset.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
      return { ok: true };
    });
  }
  async invite(p: Principal, input: any) {
    requirePermission(p, 'users.write');
    const email = String(input.email || '')
        .trim()
        .toLowerCase(),
      role = String(input.role || 'VIEWER');
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !['ADMIN', 'ACCOUNTANT', 'VIEWER'].includes(role)
    )
      throw new ApiError('ایمیل یا نقش معتبر نیست.', 422);
    const token = randomBytes(32).toString('base64url');
    const invitation = await transaction(`org:${p.organizationId}`, async (tx) => {
      const sub = await requireSubscription(tx, p);
      if (
        (await tx.membership.count({
          where: { organizationId: p.organizationId!, active: true },
        })) >= sub.plan.userLimit
      )
        throw new ApiError('ظرفیت کاربران تکمیل است.', 402);
      const result = await tx.invitation.create({
        data: {
          organizationId: p.organizationId!,
          email,
          role,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 72 * 3600000),
        },
      });
      await audit(tx, p, 'users.invite', 'دعوت عضویت ساخته شد', undefined, result.id, undefined, {
        email,
        role,
      });
      return result;
    });
    await localNotification(email, 'accept-invitation', token);
    return { id: invitation.id, expiresAt: invitation.expiresAt, mode: 'local-outbox' };
  }
  async accept(p: Principal, input: any) {
    return transaction('invite:' + hash(String(input.token)), async (tx) => {
      const invite = await tx.invitation.findUnique({
        where: { tokenHash: hash(String(input.token || '')) },
      });
      if (!invite || invite.acceptedAt || invite.expiresAt < new Date() || invite.email !== p.email)
        throw new ApiError('دعوت معتبر نیست یا متعلق به ایمیل شما نیست.', 422);
      const sub = await tx.subscription.findUnique({
        where: { organizationId: invite.organizationId },
        include: { plan: true },
      });
      if (!sub || sub.endsAt < new Date() || !['ACTIVE', 'TRIAL'].includes(sub.status))
        throw new ApiError('اشتراک سازمان فعال نیست.', 402);
      if (
        (await tx.membership.count({
          where: { organizationId: invite.organizationId, active: true },
        })) >= sub.plan.userLimit
      )
        throw new ApiError('ظرفیت کاربران تکمیل است.', 402);
      if (
        await tx.membership.findUnique({
          where: {
            organizationId_userId: { organizationId: invite.organizationId, userId: p.userId },
          },
        })
      )
        throw new ApiError('شما قبلاً عضو این سازمان هستید.', 409);
      await tx.membership.create({
        data: { organizationId: invite.organizationId, userId: p.userId, role: invite.role },
      });
      await tx.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      await tx.session.update({
        where: { id: p.sessionId },
        data: { organizationId: invite.organizationId },
      });
      await audit(
        tx,
        { ...p, organizationId: invite.organizationId },
        'users.accept',
        'دعوت عضویت پذیرفته شد',
      );
      return { ok: true };
    });
  }
}
