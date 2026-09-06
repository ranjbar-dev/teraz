import { randomUUID } from 'node:crypto';
import { toJalaali, toGregorian } from 'jalaali-js';
import { Tx, json, validDate, ApiError, Principal, audit } from './core';
const chart = [
  ['1100', 'وجوه نقد و بانک', 'دارایی', 'cash'],
  ['1200', 'حساب‌های دریافتنی', 'دارایی', 'receivable'],
  ['1300', 'موجودی کالا', 'دارایی', 'inventory'],
  ['1400', 'دارایی ثابت', 'دارایی', 'assets'],
  ['1450', 'استهلاک انباشته', 'دارایی', 'accumulated'],
  ['1500', 'مالیات خرید', 'دارایی', 'vat-input'],
  ['2100', 'حساب‌های پرداختنی', 'بدهی', 'payable'],
  ['2200', 'مالیات فروش', 'بدهی', 'vat-output'],
  ['2300', 'حقوق پرداختنی', 'بدهی', 'payroll'],
  ['2310', 'بیمه پرداختنی', 'بدهی', 'insurance'],
  ['2320', 'مالیات حقوق پرداختنی', 'بدهی', 'salary-tax'],
  ['2400', 'چک‌های پرداختنی', 'بدهی', 'checks-payable'],
  ['1600', 'چک‌های دریافتنی', 'دارایی', 'checks-receivable'],
  ['3100', 'سرمایه و افتتاحیه', 'سرمایه', 'equity'],
  ['3200', 'سود و زیان انباشته', 'سرمایه', 'retained'],
  ['4100', 'درآمد فروش', 'درآمد', 'sales'],
  ['4200', 'سایر درآمدها', 'درآمد', 'income'],
  ['4300', 'سود تسعیر ارز', 'درآمد', 'fx-gain'],
  ['5100', 'بهای تمام‌شده فروش', 'هزینه', 'cogs'],
  ['5200', 'هزینه‌های عملیاتی', 'هزینه', 'expense'],
  ['5300', 'هزینه حقوق', 'هزینه', 'salary'],
  ['5400', 'هزینه استهلاک', 'هزینه', 'depreciation'],
  ['5500', 'زیان تسعیر ارز', 'هزینه', 'fx-loss'],
  ['5600', 'سربار تولید', 'هزینه', 'overhead'],
];
export async function createCompany(
  tx: Tx,
  organizationId: string,
  input: Record<string, unknown>,
) {
  const code = String(input.code || '01').trim(),
    name = String(input.name || 'شرکت اصلی').trim();
  if (!name || name.length > 150 || !code || code.length > 40)
    throw new ApiError('نام یا کد شرکت معتبر نیست.');
  const baseCurrency = String(input.baseCurrency || 'IRT');
  if (!['IRR', 'IRT', 'USD', 'EUR', 'AED'].includes(baseCurrency))
    throw new ApiError('ارز مبنا معتبر نیست.');
  const company = await tx.company.create({
    data: {
      organizationId,
      code,
      name,
      baseCurrency,
      data: json(input),
      settings: {
        currency: (
          { IRR: 'ریال', IRT: 'تومان', USD: 'دلار', EUR: 'یورو', AED: 'درهم' } as Record<
            string,
            string
          >
        )[baseCurrency],
        baseCurrency,
        calendar: 'شمسی',
        digits: 'فارسی',
        taxRate: 10,
        paymentTerms: 30,
        invoicePrefix: 'TR',
        invoiceNote: '',
        phone: String(input.phone || ''),
        address: String(input.address || ''),
      },
    },
  });
  const branchId = randomUUID(),
    yearId = randomUUID();
  const jy = toJalaali(new Date()).jy;
  const start = toGregorian(jy, 1, 1),
    end = toGregorian(jy + 1, 1, 1);
  const startDate = `${start.gy}-${String(start.gm).padStart(2, '0')}-${String(start.gd).padStart(2, '0')}`;
  const endDate = new Date(Date.UTC(end.gy, end.gm - 1, end.gd - 1)).toISOString().slice(0, 10);
  await tx.record.create({
    data: {
      id: branchId,
      organizationId,
      companyId: company.id,
      module: 'branches',
      code: '01',
      name: 'دفتر مرکزی',
      status: 'فعال',
      data: { name: 'دفتر مرکزی', code: '01' },
    },
  });
  await tx.record.create({
    data: {
      id: yearId,
      organizationId,
      companyId: company.id,
      module: 'fiscal-years',
      code: String(jy),
      name: `سال مالی ${jy}`,
      status: 'باز',
      date: validDate(startDate),
      data: { name: `سال مالی ${jy}`, startDate, endDate },
    },
  });
  await tx.record.createMany({
    data: chart.map(([code, name, type, system]) => ({
      organizationId,
      companyId: company.id,
      module: 'accounts',
      code,
      name,
      status: 'فعال',
      data: { code, name, type, level: 'معین', system },
    })),
  });
  const rates =
    baseCurrency === 'IRR'
      ? [10, 1, 950000, 1040000, 260000]
      : baseCurrency === 'IRT'
        ? [1, 0.1, 95000, 104000, 26000]
        : [
            0,
            0,
            baseCurrency === 'USD' ? 1 : 0,
            baseCurrency === 'EUR' ? 1 : 0,
            baseCurrency === 'AED' ? 1 : 0,
          ];
  await tx.record.createMany({
    data: ['تومان', 'ریال', 'دلار', 'یورو', 'درهم'].map((name, i) => ({
      organizationId,
      companyId: company.id,
      module: 'currencies',
      code: ['IRT', 'IRR', 'USD', 'EUR', 'AED'][i],
      name,
      status: 'فعال',
      date: new Date(),
      data: {
        name,
        rate: String(rates[i]),
        date: new Date().toISOString().slice(0, 10),
        needsReview: true,
      },
    })),
  });
  return company;
}
export async function createOrganization(
  tx: Tx,
  input: { name: string; slug: string; ownerId: string; planId?: string; trialDays?: number },
) {
  const plan = input.planId
    ? await tx.plan.findUnique({ where: { id: input.planId } })
    : await tx.plan.findFirst({ where: { active: true }, orderBy: { price: 'asc' } });
  if (!plan) throw new ApiError('پلن اشتراک تعریف نشده.', 503, 'PLAN_REQUIRED');
  const org = await tx.organization.create({ data: { name: input.name, slug: input.slug } });
  await tx.membership.create({
    data: { organizationId: org.id, userId: input.ownerId, role: 'OWNER' },
  });
  await tx.subscription.create({
    data: {
      organizationId: org.id,
      planId: plan.id,
      status: 'TRIAL',
      endsAt: new Date(Date.now() + (input.trialDays ?? 14) * 86400000),
    },
  });
  await createCompany(tx, org.id, { name: input.name, code: '01' });
  return org;
}
