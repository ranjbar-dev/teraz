import { db, Principal, Scope } from './core';
import { RecordsService } from './records';
import { PayrollService, samplePayrollRules } from './payroll';
import { requireLocalMode } from './local-mode';
import { toJalaali } from 'jalaali-js';
export async function seedPayrollPreview() {
  requireLocalMode();
  const organization = await db.organization.findUnique({ where: { slug: 'taraz-demo' } });
  if (!organization) return;
  const owner = await db.membership.findFirstOrThrow({
    where: { organizationId: organization.id, role: 'OWNER' },
    include: { user: true },
  });
  const company = await db.company.findFirstOrThrow({
    where: { organizationId: organization.id },
    orderBy: { createdAt: 'asc' },
  });
  const date = new Date().toISOString().slice(0, 10);
  const years = await db.record.findMany({
    where: { companyId: company.id, module: 'fiscal-years', status: 'باز' },
  });
  const year = years.find(
    (y) => (y.data as any).startDate <= date && (y.data as any).endDate >= date,
  );
  if (!year) {
    console.log('No open current demo year; payroll preview seed skipped.');
    return;
  }
  const code = 'LOCAL-PAYROLL-' + year.id.slice(0, 8);
  if (await db.record.findFirst({ where: { companyId: company.id, module: 'payroll', code } }))
    return;
  const p: Principal = {
    userId: owner.userId,
    name: owner.user.name,
    email: owner.user.email,
    superAdmin: false,
    organizationId: organization.id,
    role: 'OWNER',
    companyIds: [],
    permissions: [],
    sessionId: '',
  };
  const s: Scope = {
    organizationId: organization.id,
    companyId: company.id,
    yearId: year.id,
    branchId: 'all',
  };
  const records = new RecordsService();
  let employee = await db.record.findFirst({
    where: { companyId: company.id, module: 'employees', code: 'LOCAL-PAYROLL-EMP' },
  });
  if (!employee)
    employee = (await records.write(p, s, 'employees', {
      code: 'LOCAL-PAYROLL-EMP',
      name: 'کارمند نمونهٔ خروجی حقوق',
      salary: '50000000',
      position: 'کارمند آزمایشی',
      nationalId: '0000000000',
      insuranceNumber: '00000000',
      hireDate: date,
      status: 'فعال',
    })) as any;
  const rule =
    (await db.payrollRule.findFirst({
      where: {
        companyId: company.id,
        name: 'قواعد نمونهٔ آزمون محلی',
        verified: true,
        from: { lte: new Date(date) },
        to: { gte: new Date(date) },
      },
    })) ||
    (await new PayrollService().save(p, s, {
      name: 'قواعد نمونهٔ آزمون محلی',
      from: (year.data as any).startDate,
      to: (year.data as any).endDate,
      source:
        'LOCAL TEST ONLY — sample values accepted for local tests; not a verified legal circular',
      verified: true,
      rules: samplePayrollRules,
    }));
  const bank = await db.record.findFirstOrThrow({
    where: { companyId: company.id, module: 'banks', status: 'فعال' },
  });
  const month = [
    'فروردین',
    'اردیبهشت',
    'خرداد',
    'تیر',
    'مرداد',
    'شهریور',
    'مهر',
    'آبان',
    'آذر',
    'دی',
    'بهمن',
    'اسفند',
  ][toJalaali(new Date()).jm - 1];
  const factor = company.baseCurrency === 'IRR' ? 10 : 1;
  await records.write(p, s, 'payroll', {
    code,
    date,
    employeeId: employee!.id,
    bankId: bank.id,
    month,
    base: String(50000000 * factor),
    benefits: String(5000000 * factor),
    deductions: '0',
    days: 30,
    overtimeHours: '0',
    ruleId: rule.id,
    status: 'تأیید شده',
    notes: 'فیش ساختگی فقط برای آزمایش خروجی؛ شناسه‌های کارمند واقعی نیستند.',
  });
  console.log(
    'Local sample payslip created for testing exports; this is not a legal payroll certification.',
  );
}
