import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { promisify } from 'node:util';
import Decimal from 'decimal.js';
import { config } from 'dotenv';
import path from 'node:path';
import catalog from './catalog.json';
config({ path: path.resolve(__dirname, '../.env') });
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const D = (v: unknown = 0) => {
  try {
    const d = new Decimal(String(v ?? 0));
    if (!d.isFinite()) throw 0;
    return d;
  } catch {
    throw new ApiError('مقدار عددی معتبر نیست.', 422, 'INVALID_NUMBER');
  }
};
export const money = (v: unknown) => D(v).toDecimalPlaces(6).toFixed(6);
export const json = <T>(value: T): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code = 'VALIDATION_ERROR',
    public fieldErrors: Record<string, string> = {},
  ) {
    super(message);
  }
}
export type Tx = Prisma.TransactionClient;
export const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 12 }),
});
export type Principal = {
  userId: string;
  name: string;
  email: string;
  superAdmin: boolean;
  organizationId: string | null;
  role: string;
  companyIds: string[];
  permissions: string[];
  sessionId: string;
};
export type Scope = { organizationId: string; companyId: string; branchId: string; yearId: string };
export type Field = {
  key: string;
  label: string;
  type?: string;
  ref?: string;
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  default?: string | number;
  hidden?: boolean;
};
export type Module = {
  key: string;
  title: string;
  singular: string;
  group: string;
  fields: Field[];
  kind?: string;
  admin?: boolean;
  status?: string[];
  global?: boolean;
};
export const modules = catalog.modules as Module[];
export const reportCatalog = catalog.reports;
export const moduleOf = (key: string) => {
  const m = modules.find((m) => m.key === key);
  if (!m) throw new ApiError('بخش یافت نشد.', 404, 'NOT_FOUND');
  return m;
};
export const masters = new Set([
  'people',
  'products',
  'warehouses',
  'banks',
  'accounts',
  'employees',
  'assets',
  'boms',
  'projects',
  'branches',
  'fiscal-years',
  'currencies',
  'companies',
  'users',
]);
export const roleLabel = (role: string) =>
  ({ OWNER: 'مدیر', ADMIN: 'مدیر', ACCOUNTANT: 'حسابدار', VIEWER: 'مشاهده‌گر' })[role] || role;
export const roleCode = (role: string) =>
  ({ مدیر: 'ADMIN', حسابدار: 'ACCOUNTANT', مشاهده‌گر: 'VIEWER' })[role] || role;
export const normalize = (v: unknown) =>
  String(v ?? '')
    .normalize('NFKC')
    .replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)))
    .replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)))
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[٬,\u200c]/g, '')
    .trim()
    .toLowerCase();
export function validDate(v: unknown) {
  const s = String(v || '');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new ApiError('تاریخ معتبر نیست.', 422, 'INVALID_DATE');
  return new Date(s + 'T00:00:00.000Z');
}
export const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const scrypt = promisify(scryptCallback);
export async function passwordHash(password: string) {
  if (password.length < 12 || password.length > 128)
    throw new ApiError('رمز عبور باید بین ۱۲ تا ۱۲۸ نویسه باشد.', 422, 'WEAK_PASSWORD');
  const salt = randomBytes(16).toString('hex');
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [salt, h] = stored.split(':');
  if (!salt || !h || password.length > 128) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(h, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function encrypt(value: unknown) {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex');
  if (key.length !== 32)
    throw new ApiError('کلید رمزگذاری سرور تنظیم نشده.', 503, 'CONFIG_REQUIRED');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}
export function decrypt(value: string) {
  const [iv, tag, body] = value.split('.').map((v) => Buffer.from(v, 'base64url'));
  const cipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(process.env.ENCRYPTION_KEY || '', 'hex'),
    iv,
  );
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(body), cipher.final()]).toString('utf8'));
}
export async function transaction<T>(lock: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let i = 0; i < 4; i++) {
    try {
      return await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock},0))::text`;
          return fn(tx);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30000,
          maxWait: 10000,
        },
      );
    } catch (e) {
      if ((e as { code?: string }).code === 'P2034' && i < 3) continue;
      throw e;
    }
  }
  throw new Error('unreachable');
}
export async function audit(
  tx: Tx,
  p: Principal,
  action: string,
  message: string,
  companyId?: string,
  targetId?: string,
  before?: unknown,
  after?: unknown,
) {
  await tx.auditEvent.create({
    data: {
      organizationId: p.organizationId,
      companyId,
      userId: p.userId,
      userName: p.name,
      action,
      message,
      targetId,
      ...(before !== undefined ? { before: json(before) } : {}),
      ...(after !== undefined ? { after: json(after) } : {}),
    },
  });
}
export function can(p: Principal, action: string) {
  return (
    p.superAdmin ||
    ['OWNER', 'ADMIN'].includes(p.role) ||
    p.permissions.includes(action) ||
    (p.role === 'ACCOUNTANT' &&
      !/^(platform|users|companies|branches|fiscal-years|currencies|settings|subscription|integrations|payroll-rules)\./.test(
        action,
      )) ||
    (p.role === 'VIEWER' && action.endsWith('.read'))
  );
}
export function requirePermission(p: Principal, action: string) {
  if (!can(p, action)) throw new ApiError('اجازهٔ انجام این عملیات را ندارید.', 403, 'FORBIDDEN');
}
export async function requireSubscription(tx: Tx, p: Principal) {
  if (!p.organizationId) throw new ApiError('سازمان را انتخاب کنید.', 403, 'ORGANIZATION_REQUIRED');
  const org = await tx.organization.findUnique({
    where: { id: p.organizationId },
    include: { subscription: { include: { plan: true } } },
  });
  if (!org || org.status !== 'ACTIVE')
    throw new ApiError('سازمان تعلیق شده است.', 403, 'ORGANIZATION_SUSPENDED');
  if (
    !org.subscription ||
    !['ACTIVE', 'TRIAL'].includes(org.subscription.status) ||
    org.subscription.endsAt < new Date()
  )
    throw new ApiError('اشتراک سازمان نیاز به تمدید دارد.', 402, 'SUBSCRIPTION_EXPIRED');
  return org.subscription;
}
export async function scopeFor(p: Principal, q: Record<string, unknown>, tx: Tx = db) {
  if (!p.organizationId)
    throw new ApiError('ابتدا یک سازمان انتخاب کنید.', 403, 'ORGANIZATION_REQUIRED');
  const company = await tx.company.findFirst({
    where: {
      organizationId: p.organizationId,
      ...(q.companyId ? { id: String(q.companyId) } : {}),
      ...(!p.superAdmin && !['OWNER', 'ADMIN'].includes(p.role) && p.companyIds.length
        ? { id: { in: p.companyIds, ...(q.companyId ? { equals: String(q.companyId) } : {}) } }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!company) throw new ApiError('شرکت در این سازمان یافت نشد.', 404, 'COMPANY_NOT_FOUND');
  const year = q.yearId
    ? await tx.record.findFirst({
        where: { id: String(q.yearId), companyId: company.id, module: 'fiscal-years' },
      })
    : await tx.record.findFirst({
        where: { companyId: company.id, module: 'fiscal-years' },
        orderBy: { date: 'desc' },
      });
  if (q.yearId && !year) throw new ApiError('سال مالی معتبر نیست.', 422, 'INVALID_YEAR');
  const branchId = String(q.branchId || 'all');
  if (
    branchId !== 'all' &&
    !(await tx.record.findFirst({
      where: { id: branchId, companyId: company.id, module: 'branches' },
    }))
  )
    throw new ApiError('شعبه معتبر نیست.', 422, 'INVALID_BRANCH');
  return {
    organizationId: p.organizationId,
    companyId: company.id,
    yearId: year?.id || '',
    branchId,
  };
}
export const recordWhere = (scope: Scope, key: string) => ({
  organizationId: scope.organizationId,
  companyId: scope.companyId,
  module: key,
  ...(!masters.has(key)
    ? {
        ...(scope.yearId ? { yearId: scope.yearId } : {}),
        ...(scope.branchId !== 'all' ? { branchId: scope.branchId } : {}),
      }
    : {}),
});
export function serializeRecord(r: any) {
  return {
    ...r.data,
    id: r.id,
    companyId: r.companyId,
    organizationId: r.organizationId,
    branchId: r.branchId || '',
    yearId: r.yearId || '',
    code: r.code,
    name: r.name,
    status: r.status,
    date: r.date?.toISOString().slice(0, 10) || r.data?.date || '',
    createdAt: r.createdAt.toISOString(),
    version: r.version,
    postedAt: r.postedAt?.toISOString() || null,
    reversedAt: r.reversedAt?.toISOString() || null,
    total: r.total.toString(),
    ...(r.lines
      ? {
          lines: r.lines.map((l: any) => ({
            ...l.data,
            id: l.id,
            productId: l.productId || '',
            accountId: l.accountId || '',
            title: l.title,
            quantity: l.quantity.toString(),
            price: l.price.toString(),
            discount: l.discount.toString(),
            tax: l.tax.toString(),
            debit: l.debit.toString(),
            credit: l.credit.toString(),
            cost: l.cost.toString(),
          })),
        }
      : {}),
  };
}
