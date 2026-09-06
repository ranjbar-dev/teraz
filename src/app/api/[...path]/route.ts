import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { withStore } from '@/lib/store';
import { active, amountOf, bankBalance, invoiceTotals, number, scoped } from '@/lib/domain';
import { dashboard, report } from '@/lib/reports';
import { moduleByKey, modules, reports } from '@/lib/modules';
import {
  ApiError,
  afterValidate,
  assertOrigin,
  assertWrite,
  audit,
  getRows,
  getScope,
  getUser,
  protectDelete,
  safeRow,
  validate,
  verifyPassword,
} from '@/lib/server';
import type { Database, Row } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: NextRequest, ctx: Context) {
  try {
    const { path } = await ctx.params;
    const [key, id] = path;
    const method = req.method;
    const data = ['POST', 'PATCH'].includes(method)
      ? await req.json().catch(() => {
          throw new ApiError('بدنهٔ درخواست معتبر نیست.');
        })
      : {};
    return await withStore(async (db: Database) => {
      if (key === 'auth' && method === 'POST') {
        assertOrigin(req);
        const u = db.collections.users.find(
          (u) => u.email === String(data.email || '').toLowerCase() && u.status === 'فعال',
        );
        if (!u || !verifyPassword(String(data.password || ''), String(u.passwordHash)))
          throw new ApiError('ایمیل یا رمز عبور اشتباه است.', 401);
        const token = randomUUID();
        db.sessions[token] = { userId: u.id, expires: Date.now() + 7 * 86400000 };
        const response = NextResponse.json({ user: safeRow(u) });
        response.cookies.set('taraz-session', token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: req.nextUrl.protocol === 'https:',
          path: '/',
          maxAge: 7 * 86400,
        });
        return response;
      }
      const user = getUser(req, db);
      if (key === 'auth' && method === 'DELETE') {
        assertOrigin(req);
        delete db.sessions[req.cookies.get('taraz-session')?.value || ''];
        const response = NextResponse.json({ ok: true });
        response.cookies.delete('taraz-session');
        return response;
      }
      const scope = getScope(req, db);
      if (key === 'bootstrap' && method === 'GET') {
        const lookups = Object.fromEntries(
          modules
            .filter((m) => m.key !== 'users')
            .map((m) => [m.key, getRows(db, m.key, scope).map(safeRow)]),
        );
        return NextResponse.json({
          user,
          scope,
          companies: db.collections.companies.map(safeRow),
          branches: scoped(db.collections.branches, scope, true),
          years: scoped(db.collections['fiscal-years'], scope, true),
          settings: db.settings[scope.companyId] || {
            currency: 'تومان',
            taxRate: 10,
            digits: 'فارسی',
            calendar: 'شمسی',
          },
          lookups,
        });
      }
      if (key === 'dashboard' && method === 'GET')
        return NextResponse.json(
          dashboard(db, scope, req.nextUrl.searchParams.get('months') === '12' ? 12 : 6),
        );
      if (key === 'reports' && method === 'GET') {
        if (!reports.some((r) => r.key === id)) throw new ApiError('گزارش یافت نشد.', 404);
        return NextResponse.json(
          report(
            db,
            scope,
            id,
            req.nextUrl.searchParams.get('from') || '',
            req.nextUrl.searchParams.get('to') || '',
            req.nextUrl.searchParams.get('accountId') || '',
          ),
        );
      }
      if (key === 'activity' && method === 'GET')
        return NextResponse.json({
          rows: db.audit.filter((a) => a.companyId === scope.companyId).reverse(),
        });
      if (key === 'settings') {
        if (method === 'GET') return NextResponse.json(db.settings[scope.companyId] || {});
        assertWrite(req, user, true);
        if (method !== 'PATCH') throw new ApiError('روش مجاز نیست.', 405);
        const settings = { ...(db.settings[scope.companyId] || {}) };
        for (const k of [
          'currency',
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
          if (data[k] !== undefined) settings[k] = String(data[k]).slice(0, 1000);
        if (
          number(settings.taxRate) < 0 ||
          number(settings.taxRate) > 100 ||
          number(settings.paymentTerms) < 0
        )
          throw new ApiError('نرخ مالیات یا مهلت پرداخت معتبر نیست.');
        db.settings[scope.companyId] = settings;
        audit(db, user, scope, 'تنظیمات شرکت به‌روزرسانی شد');
        return NextResponse.json(settings);
      }
      const mod = moduleByKey(key);
      if (!mod) throw new ApiError('مسیر یافت نشد.', 404);
      if (mod.admin && user.role !== 'مدیر')
        throw new ApiError('این بخش فقط برای مدیر در دسترس است.', 403);
      const rows = getRows(db, key, scope);
      const old = id ? rows.find((r) => r.id === id) : undefined;
      if (id && !old) throw new ApiError('رکورد یافت نشد.', 404);
      const decorate = (r: Row) => {
        const result = safeRow(r);
        if (mod.kind || ['payroll', 'depreciation'].includes(key))
          result.total = amountOf(key, r, db);
        if (key === 'banks') result.balance = bankBalance(db, r, scope);
        if (key === 'assets')
          result.bookValue =
            number(r.cost) -
            db.collections.depreciation
              .filter((d) => d.assetId === r.id && active(d))
              .reduce((s, d) => s + amountOf('depreciation', d, db), 0);
        if (['sales', 'purchases'].includes(key)) {
          result.paid = db.collections[key === 'sales' ? 'receipts' : 'payments']
            .filter((p) => p.invoiceId === r.id && active(p))
            .reduce((s, p) => s + number(p.amount), 0);
          result.remaining = invoiceTotals(r).total - number(result.paid);
        }
        return result;
      };
      if (method === 'GET')
        return NextResponse.json(id ? decorate(old!) : { rows: rows.map(decorate).reverse() });
      assertWrite(req, user, mod.admin);
      if (method === 'DELETE') {
        if (!old) throw new ApiError('شناسه لازم است.');
        protectDelete(db, mod, old, user);
        db.collections[key] = db.collections[key].filter((r) => r.id !== old.id);
        afterValidate(db, mod, old, old);
        audit(db, user, scope, `${mod.singular} «${old.code || old.name}» حذف شد`);
        return NextResponse.json({ ok: true });
      }
      if (!['POST', 'PATCH'].includes(method)) throw new ApiError('روش مجاز نیست.', 405);
      if (method === 'PATCH' && !old) throw new ApiError('شناسه لازم است.');
      if (old && active(old) && Object.keys(data).some((k) => k !== 'status'))
        throw new ApiError('برای ویرایش، ابتدا سند تأییدشده را به پیش‌نویس برگردانید.');
      if (
        old?.id === user.id &&
        ((data.role && data.role !== old.role) || data.status === 'غیرفعال')
      )
        throw new ApiError('نقش یا وضعیت حساب جاری را نمی‌توانید تغییر دهید.');
      const row = validate(db, mod, data, scope, old);
      if (key === 'companies' && !old) {
        row.companyId = row.id;
        row.branchId = `${row.id}-branch`;
        row.yearId = `${row.id}-year`;
        const branch = { ...row, id: row.branchId, name: 'دفتر مرکزی', code: '01', status: 'فعال' };
        const year = {
          ...row,
          id: row.yearId,
          name: 'سال مالی ۱۴۰۵',
          startDate: '2026-03-21',
          endDate: '2027-03-20',
          status: 'باز',
        };
        db.collections.branches.push(branch);
        db.collections['fiscal-years'].push(year);
        const source = db.collections.accounts.filter(
          (a) => a.companyId === scope.companyId && a.system,
        );
        db.collections.accounts.push(
          ...source.map((a) => ({
            ...a,
            id: randomUUID(),
            companyId: row.id,
            branchId: row.branchId,
            yearId: row.yearId,
          })),
        );
        db.settings[row.id] = {
          currency: 'تومان',
          taxRate: 10,
          calendar: 'شمسی',
          digits: 'فارسی',
          paymentTerms: 30,
        };
      }
      if (old) db.collections[key][db.collections[key].findIndex((r) => r.id === old.id)] = row;
      else db.collections[key].push(row);
      afterValidate(db, mod, row, old);
      audit(
        db,
        user,
        scope,
        `${mod.singular} «${row.code || row.name || ''}» ${old ? 'به‌روزرسانی' : 'ثبت'} شد`,
      );
      return NextResponse.json(decorate(row), { status: old ? 200 : 201 });
    }, method !== 'GET');
  } catch (e) {
    if (!(e instanceof ApiError)) console.error(e);
    return NextResponse.json(
      { error: e instanceof ApiError ? e.message : 'خطایی در پردازش رخ داد. دوباره تلاش کنید.' },
      { status: e instanceof ApiError ? e.status : 500 },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
