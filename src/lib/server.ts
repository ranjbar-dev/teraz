import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { active, amountOf, invoiceTotals, number, scoped, stockBalances } from './domain';
import { masterKeys, moduleByKey, modules } from './modules';
import { hashPassword } from './seed';
import type { Database, Line, Module, Row, Scope, User } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function getUser(req: NextRequest, db: Database): User {
  const token = req.cookies.get('taraz-session')?.value || '';
  const session = db.sessions[token];
  const user =
    session && session.expires > Date.now()
      ? db.collections.users.find((u) => u.id === session.userId && u.status === 'فعال')
      : undefined;
  if (!user) throw new ApiError('برای ادامه وارد حساب خود شوید.', 401);
  return {
    id: user.id,
    name: String(user.name),
    email: String(user.email),
    role: String(user.role),
  };
}
export function verifyPassword(password: string, hash: string) {
  const [salt, digest] = hash.split(':');
  if (!salt || !digest) return false;
  const a = scryptSync(password, salt, 32),
    b = Buffer.from(digest, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
export function assertOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== (req.headers.get('host') || req.nextUrl.host))
    throw new ApiError('مبدأ درخواست نامعتبر است.', 403);
}
export function assertWrite(req: NextRequest, user: User, admin = false) {
  assertOrigin(req);
  if (user.role === 'مشاهده‌گر' || (admin && user.role !== 'مدیر'))
    throw new ApiError('نقش شما اجازهٔ انجام این عملیات را ندارد.', 403);
}
export function getScope(req: NextRequest, db: Database): Scope {
  const q = req.nextUrl.searchParams,
    companyId = q.get('companyId') || db.collections.companies[0]?.id;
  if (!db.collections.companies.some((c) => c.id === companyId))
    throw new ApiError('شرکت انتخاب‌شده یافت نشد.', 404);
  const branchId = q.get('branchId') || 'all',
    yearId =
      q.get('yearId') ||
      db.collections['fiscal-years'].find((y) => y.companyId === companyId)?.id ||
      '';
  if (
    branchId !== 'all' &&
    !db.collections.branches.some((b) => b.companyId === companyId && b.id === branchId)
  )
    throw new ApiError('شعبه نامعتبر است.');
  if (
    yearId &&
    !db.collections['fiscal-years'].some((y) => y.companyId === companyId && y.id === yearId)
  )
    throw new ApiError('سال مالی نامعتبر است.');
  return { companyId, branchId, yearId };
}
export function safeRow(r: Row) {
  const copy = { ...r };
  delete copy.passwordHash;
  delete copy.password;
  return copy;
}
export function getRows(db: Database, key: string, scope: Scope) {
  const mod = moduleByKey(key);
  if (!mod) throw new ApiError('صفحه یافت نشد.', 404);
  return mod.global ? db.collections[key] : scoped(db.collections[key], scope, masterKeys.has(key));
}
function validateDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validate(
  db: Database,
  mod: Module,
  data: Record<string, unknown>,
  scope: Scope,
  old?: Row,
): Row {
  const branch =
    scope.branchId === 'all'
      ? String(
          data.branchId ||
            db.collections.branches.find(
              (b) => b.companyId === scope.companyId && b.status === 'فعال',
            )?.id ||
            '',
        )
      : scope.branchId;
  if (
    branch &&
    !db.collections.branches.some(
      (b) => b.id === branch && b.companyId === scope.companyId && b.status === 'فعال',
    )
  )
    throw new ApiError('شعبهٔ ثبت معتبر نیست.');
  const row = {
    id: old?.id || randomUUID(),
    companyId: old?.companyId || scope.companyId,
    branchId: old?.branchId || branch || '',
    yearId: old?.yearId || scope.yearId,
    createdAt: old?.createdAt || new Date().toISOString(),
    status: old?.status || mod.status?.[0] || '',
    ...old,
  } as Row;
  for (const field of mod.fields) {
    if (field.key === 'password') continue;
    const value = data[field.key] ?? old?.[field.key] ?? field.default ?? '';
    if (field.required && (value === '' || value === null))
      throw new ApiError(`${field.label} را وارد کنید.`);
    if (['money', 'number'].includes(field.type || '') && value !== '') {
      const n = Number(value);
      if (
        !Number.isFinite(n) ||
        n < (field.min ?? -Number.MAX_SAFE_INTEGER) ||
        n > (field.max ?? Number.MAX_SAFE_INTEGER)
      )
        throw new ApiError(`${field.label} خارج از محدودهٔ مجاز است.`);
      row[field.key] = n;
    } else {
      if (typeof value !== 'string' && typeof value !== 'number')
        throw new ApiError(`${field.label} نامعتبر است.`);
      row[field.key] = String(value).trim().slice(0, 2000);
    }
    if (field.options && row[field.key] && !field.options.includes(String(row[field.key])))
      throw new ApiError(`${field.label} نامعتبر است.`);
    if (field.type === 'date' && row[field.key] && !validateDate(String(row[field.key])))
      throw new ApiError(`${field.label} معتبر نیست.`);
    if (
      field.type === 'email' &&
      row[field.key] &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row[field.key]))
    )
      throw new ApiError('ایمیل معتبر وارد کنید.');
    if (field.ref && row[field.key]) {
      const ref = db.collections[field.ref].find(
        (r) => r.id === row[field.key] && r.companyId === row.companyId,
      );
      if (!ref) throw new ApiError(`${field.label} یافت نشد یا متعلق به شرکت دیگری است.`);
      if (ref.id === row.id) throw new ApiError('ارجاع یک رکورد به خودش مجاز نیست.');
    }
  }
  if (data.status !== undefined) {
    if (!mod.status?.includes(String(data.status))) throw new ApiError('وضعیت نامعتبر است.');
    row.status = String(data.status);
  }
  if (
    row.code &&
    db.collections[mod.key].some(
      (r) => r.id !== row.id && r.companyId === row.companyId && r.code === row.code,
    )
  )
    throw new ApiError('این کد قبلاً ثبت شده است.');
  if (
    mod.key === 'currencies' &&
    db.collections.currencies.some(
      (r) => r.id !== row.id && r.companyId === row.companyId && r.name === row.name,
    )
  )
    throw new ApiError('این ارز قبلاً ثبت شده؛ نرخ موجود را ویرایش کنید.');
  if (mod.key === 'users') {
    row.email = String(row.email).toLowerCase();
    if (db.collections.users.some((r) => r.id !== row.id && r.email === row.email))
      throw new ApiError('این ایمیل قبلاً ثبت شده است.');
    const password = String(data.password || '');
    if ((!old || password) && password.length < 8)
      throw new ApiError('رمز عبور باید حداقل ۸ نویسه باشد.');
    if (password) row.passwordHash = hashPassword(password);
  }
  if (!masterKeys.has(mod.key)) {
    const year = db.collections['fiscal-years'].find(
      (y) => y.id === row.yearId && y.companyId === row.companyId,
    );
    if (!year || year.status === 'بسته')
      throw new ApiError('این سال مالی بسته است یا انتخاب نشده است.');
    if (!row.branchId) throw new ApiError('ابتدا یک شعبه برای شرکت ایجاد کنید.');
    if (
      row.date &&
      (String(row.date) < String(year.startDate) || String(row.date) > String(year.endDate))
    )
      throw new ApiError('تاریخ ثبت باید داخل سال مالی انتخاب‌شده باشد.');
  }
  if (row.dueDate && row.date && row.dueDate < row.date)
    throw new ApiError('سررسید نمی‌تواند قبل از تاریخ ثبت باشد.');
  if (mod.key === 'fiscal-years' && row.endDate <= row.startDate)
    throw new ApiError('تاریخ پایان باید پس از شروع باشد.');
  if (
    mod.key === 'fiscal-years' &&
    db.collections['fiscal-years'].some(
      (r) =>
        r.id !== row.id &&
        r.companyId === row.companyId &&
        String(row.startDate) <= String(r.endDate) &&
        String(row.endDate) >= String(r.startDate),
    )
  )
    throw new ApiError('این دوره با یک سال مالی دیگر هم‌پوشانی دارد.');
  if (mod.kind) {
    if (!Array.isArray(data.lines ?? old?.lines)) throw new ApiError('ردیف‌های سند را وارد کنید.');
    row.lines = (data.lines ?? old?.lines) as Line[];
    if (!row.lines.length || row.lines.length > 100)
      throw new ApiError('سند باید بین ۱ تا ۱۰۰ ردیف داشته باشد.');
    row.lines = row.lines.map((line, i) => {
      const l = {
        id: String(line.id || randomUUID()),
        title: String(line.title || '').slice(0, 500),
        productId: String(line.productId || ''),
        accountId: String(line.accountId || ''),
        quantity: Number(line.quantity || 0),
        price: Number(line.price || 0),
        discount: Number(line.discount || 0),
        tax: Number(line.tax || 0),
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
      };
      if (
        [l.quantity, l.price, l.discount, l.tax, l.debit, l.credit].some(
          (n) => !Number.isFinite(n) || n < 0,
        ) ||
        l.discount > 100 ||
        l.tax > 100
      )
        throw new ApiError(`مقادیر ردیف ${i + 1} معتبر نیست.`);
      const refs = db.collections[mod.kind === 'journal' ? 'accounts' : 'products'];
      if (
        !refs.some(
          (r) =>
            r.id === (mod.kind === 'journal' ? l.accountId : l.productId) &&
            r.companyId === row.companyId,
        )
      )
        throw new ApiError(`حساب یا کالای ردیف ${i + 1} را انتخاب کنید.`);
      if (mod.kind === 'invoice' && l.quantity <= 0)
        throw new ApiError('تعداد هر ردیف باید بیشتر از صفر باشد.');
      if (mod.kind === 'journal' && ((l.debit > 0 && l.credit > 0) || (!l.debit && !l.credit)))
        throw new ApiError('هر ردیف باید فقط یک مبلغ بدهکار یا بستانکار داشته باشد.');
      return l;
    });
    if (
      mod.kind === 'journal' &&
      active(row) &&
      Math.abs(row.lines.reduce((s, l) => s + l.debit - l.credit, 0)) > 0.001
    )
      throw new ApiError('سند تراز نیست؛ جمع بدهکار و بستانکار باید برابر باشد.');
    if (number(row.discount) > invoiceTotals({ ...row, discount: 0 }).net)
      throw new ApiError('تخفیف نمی‌تواند بیشتر از مبلغ اقلام باشد.');
  }
  if (mod.key === 'accounts') {
    let parent = String(row.parentId || ''),
      depth = 0;
    while (parent) {
      if (parent === row.id || depth++ > 50)
        throw new ApiError('ساختار حساب‌ها نمی‌تواند چرخه داشته باشد.');
      parent = String(db.collections.accounts.find((r) => r.id === parent)?.parentId || '');
    }
    if (old?.system && (row.code !== old.code || row.type !== old.type))
      throw new ApiError('کد و ماهیت حساب‌های سیستمی قابل تغییر نیست.');
  }
  if (mod.key === 'transfers') {
    if (row.fromBankId === row.toBankId) throw new ApiError('حساب مبدأ و مقصد باید متفاوت باشند.');
    const a = db.collections.banks.find((r) => r.id === row.fromBankId),
      b = db.collections.banks.find((r) => r.id === row.toBankId);
    if (a?.currency !== b?.currency)
      throw new ApiError('انتقال مستقیم فقط بین حساب‌های هم‌ارز مجاز است.');
  }
  if (row.bankId && row.currency) {
    const bank = db.collections.banks.find((b) => b.id === row.bankId);
    if (bank?.currency !== row.currency)
      throw new ApiError('ارز تراکنش باید با ارز حساب مالی یکسان باشد.');
  }
  if (
    row.bankId &&
    ['payroll', 'project-costs'].includes(mod.key) &&
    db.collections.banks.find((b) => b.id === row.bankId)?.currency !== 'تومان'
  )
    throw new ApiError('برای این عملیات یک حساب تومانی انتخاب کنید.');
  if (mod.key === 'transfers') {
    const bank = db.collections.banks.find((b) => b.id === row.fromBankId);
    row.currency = String(bank?.currency || 'تومان');
    row.exchangeRate =
      number(bank?.exchangeRate) ||
      number(
        db.collections.currencies.find(
          (c) => c.companyId === row.companyId && c.name === row.currency,
        )?.rate,
      ) ||
      1;
  }
  if (
    mod.key === 'stock' &&
    row.type === 'انتقال' &&
    (!row.destinationId || row.destinationId === row.warehouseId)
  )
    throw new ApiError('برای انتقال، انبار مقصد متفاوت انتخاب کنید.');
  if (mod.key === 'assets' && number(row.salvage) > number(row.cost))
    throw new ApiError('ارزش اسقاط بیشتر از بهای دارایی است.');
  if (mod.key === 'payroll' && amountOf(mod.key, row, db) < 0)
    throw new ApiError('کسورات نمی‌تواند بیشتر از حقوق و مزایا باشد.');
  if (mod.key === 'boms' && (row.lines as Line[]).some((l) => l.productId === row.productId))
    throw new ApiError('محصول نهایی نمی‌تواند جزو مواد اولیهٔ خودش باشد.');
  if (mod.key === 'depreciation' && active(row)) {
    const asset = db.collections.assets.find((a) => a.id === row.assetId)!;
    const months = db.collections.depreciation
      .filter((r) => r.id !== row.id && r.assetId === row.assetId && active(r))
      .reduce((s, r) => s + number(r.months), 0);
    if (months + number(row.months) > number(asset.life))
      throw new ApiError('استهلاک از عمر مفید دارایی بیشتر می‌شود.');
  }
  if (row.invoiceId && ['receipts', 'payments'].includes(mod.key)) {
    const key = mod.key === 'receipts' ? 'sales' : 'purchases';
    const inv = db.collections[key].find((r) => r.id === row.invoiceId)!;
    if (
      !active(inv) ||
      inv.personId !== row.personId ||
      inv.currency !== row.currency ||
      inv.yearId !== row.yearId ||
      inv.branchId !== row.branchId
    )
      throw new ApiError('فاکتور باید تأییدشده و متعلق به همین شخص، ارز، شعبه و سال مالی باشد.');
    const paid = db.collections[mod.key]
      .filter((r) => r.id !== row.id && r.invoiceId === row.invoiceId && active(r))
      .reduce((s, r) => s + number(r.amount), 0);
    if (active(row) && paid + number(row.amount) > invoiceTotals(inv).total + 0.01)
      throw new ApiError('مبلغ پرداخت از ماندهٔ فاکتور بیشتر است.');
  }
  return row;
}
export function afterValidate(db: Database, mod: Module, row: Row, old?: Row) {
  if (old && active(old) && !active(row)) {
    const dependencies = [...db.collections.receipts, ...db.collections.payments].filter(
      (r) => r.invoiceId === old.id && active(r),
    );
    if (dependencies.length) throw new ApiError('ابتدا دریافت‌ها یا پرداخت‌های مرتبط را لغو کنید.');
  }
  if (
    ['stock', 'sales', 'purchases', 'sales-returns', 'purchase-returns', 'production'].includes(
      mod.key,
    )
  ) {
    const scope = { companyId: row.companyId, branchId: 'all', yearId: row.yearId };
    const balances = stockBalances(db, scope);
    const negative = balances.find((r) => r.quantity < 0);
    if (negative)
      throw new ApiError(`موجودی «${negative.name}» در «${negative.warehouse}» کافی نیست.`);
  }
}
export function protectDelete(db: Database, mod: Module, row: Row, user: User) {
  if (active(row)) throw new ApiError('ابتدا سند را لغو کنید، سپس حذف کنید.');
  if (row.system) throw new ApiError('حساب سیستمی قابل حذف نیست.');
  if (mod.key === 'users' && row.id === user.id)
    throw new ApiError('حذف حساب کاربری جاری مجاز نیست.');
  if (
    mod.key === 'companies' &&
    Object.entries(db.collections).some(
      ([k, rows]) => k !== 'companies' && k !== 'users' && rows.some((r) => r.companyId === row.id),
    )
  )
    throw new ApiError('شرکت دارای اطلاعات است و قابل حذف نیست.');
  for (const m of modules)
    for (const r of db.collections[m.key]) {
      if (m.key === mod.key && r.id === row.id) continue;
      if (
        m.fields.some((f) => f.ref === mod.key && r[f.key] === row.id) ||
        ((r.lines || []) as Line[]).some((l) => l.productId === row.id || l.accountId === row.id) ||
        (mod.key === 'branches' && r.branchId === row.id && !masterKeys.has(m.key)) ||
        (mod.key === 'fiscal-years' && r.yearId === row.id && !masterKeys.has(m.key))
      )
        throw new ApiError('این رکورد در اطلاعات دیگری استفاده شده است و قابل حذف نیست.');
    }
}
export function audit(db: Database, user: User, scope: Scope, message: string) {
  db.audit.push({
    id: randomUUID(),
    message,
    user: user.name,
    companyId: scope.companyId,
    date: new Date().toISOString(),
  });
  db.audit = db.audit.slice(-500);
}
