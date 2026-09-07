import Decimal from 'decimal.js';
import { z } from 'zod';
import {
  db,
  Tx,
  D,
  money,
  json,
  ApiError,
  Principal,
  Scope,
  requirePermission,
  requireSubscription,
  transaction,
  validDate,
  audit,
  recordWhere,
} from './core';
const numeric = z
  .union([z.number(), z.string()])
  .transform(String)
  .refine((v) => {
    try {
      return D(v).gte(0) && D(v).lte('999999999999999');
    } catch {
      return false;
    }
  });
const rulesSchema = z.object({
  minimumDailyIRR: numeric,
  insuranceCeilingMultiple: numeric,
  employeeInsurancePercent: numeric,
  employerInsurancePercent: numeric,
  unemploymentPercent: numeric,
  insuranceTaxDeductionPercent: numeric,
  hourlyDivisor: numeric,
  overtimeMultiplier: numeric,
  taxBrackets: z
    .array(z.object({ upToIRR: numeric.nullable(), rate: numeric }))
    .min(1)
    .max(20),
});
// Sample rules remain unverified until the organization supplies the applicable official circular.
export const samplePayrollRules = {
  minimumDailyIRR: '5541850',
  insuranceCeilingMultiple: '7',
  employeeInsurancePercent: '7',
  employerInsurancePercent: '20',
  unemploymentPercent: '3',
  insuranceTaxDeductionPercent: '100',
  hourlyDivisor: '220',
  overtimeMultiplier: '1.4',
  taxBrackets: [
    { upToIRR: '400000000', rate: '0' },
    { upToIRR: '800000000', rate: '10' },
    { upToIRR: '1000000000', rate: '15' },
    { upToIRR: '1200000000', rate: '20' },
    { upToIRR: '1400000000', rate: '25' },
    { upToIRR: null, rate: '30' },
  ],
};
export function calculatePayroll(input: any, rules: any, baseCurrency: string) {
  if (!['IRR', 'IRT'].includes(baseCurrency))
    throw new ApiError('حقوق ایران برای شرکت با ارز مبنای ریال یا تومان محاسبه می‌شود.', 422);
  const factor = baseCurrency === 'IRT' ? D(10) : D(1),
    days = Number(input.days ?? 30),
    overtime = D(input.overtimeHours || 0);
  if (!Number.isInteger(days) || days < 1 || days > 31 || overtime.lt(0) || overtime.gt(240))
    throw new ApiError('روز کارکرد یا ساعت اضافه‌کاری معتبر نیست.', 422);
  const base = D(input.base).mul(factor),
    benefits = D(input.benefits || 0).mul(factor),
    deductions = D(input.deductions || 0).mul(factor),
    insuranceExempt = D(input.insuranceExempt || 0).mul(factor),
    taxExempt = D(input.taxExempt || 0).mul(factor);
  if ([base, benefits, deductions, insuranceExempt, taxExempt].some((v) => v.lt(0)))
    throw new ApiError('اقلام حقوق نمی‌توانند منفی باشند.', 422);
  if (base.lt(D(rules.minimumDailyIRR).mul(days)))
    throw new ApiError(
      'حقوق پایه کمتر از حداقل مزد قاعدهٔ انتخابی است.',
      422,
      'BELOW_MINIMUM_WAGE',
    );
  const overtimePay = base
    .mul(30)
    .div(days)
    .div(D(rules.hourlyDivisor))
    .mul(D(rules.overtimeMultiplier))
    .mul(overtime)
    .round();
  const gross = base.add(benefits).add(overtimePay),
    insuranceBase = Decimal.min(
      Decimal.max(0, gross.sub(insuranceExempt)),
      D(rules.minimumDailyIRR).mul(days).mul(D(rules.insuranceCeilingMultiple)),
    );
  const insurance = insuranceBase.mul(D(rules.employeeInsurancePercent)).div(100).round(),
    employer = insuranceBase
      .mul(
        D(rules.employerInsurancePercent).add(
          input.unemploymentExempt === true ? 0 : D(rules.unemploymentPercent),
        ),
      )
      .div(100)
      .round();
  const taxable = Decimal.max(
    0,
    gross.sub(taxExempt).sub(insurance.mul(D(rules.insuranceTaxDeductionPercent)).div(100)),
  );
  let tax = D(0),
    previous = D(0);
  for (const bracket of rules.taxBrackets) {
    const ceiling = bracket.upToIRR === null ? taxable : D(bracket.upToIRR),
      portion = Decimal.max(0, Decimal.min(taxable, ceiling).sub(previous));
    tax = tax.add(portion.mul(D(bracket.rate)).div(100));
    previous = ceiling;
    if (taxable.lte(ceiling)) break;
  }
  tax = tax.round();
  const net = gross.sub(insurance).sub(tax).sub(deductions);
  if (net.lt(0)) throw new ApiError('خالص حقوق منفی است.', 422);
  return {
    base: money(base.div(factor)),
    benefits: money(benefits.add(overtimePay).div(factor)),
    inputBenefits: money(benefits.div(factor)),
    overtime: money(overtimePay.div(factor)),
    insurance: money(insurance.div(factor)),
    employerInsurance: money(employer.div(factor)),
    tax: money(tax.div(factor)),
    deductions: money(deductions.div(factor)),
    total: money(net.div(factor)),
    gross: money(gross.div(factor)),
    insuranceBaseIRR: money(insuranceBase),
    taxableBaseIRR: money(taxable),
    days,
    baseCurrency,
    rounding: 'IRR_HALF_UP',
    taxMethod: 'MONTHLY_BRACKETS',
  };
}
export class PayrollService {
  async exportRows(p: Principal, s: Scope, q: any = {}) {
    requirePermission(p, 'payroll.read');
    const company = await db.company.findUniqueOrThrow({ where: { id: s.companyId } });
    if (!['IRT', 'IRR'].includes(company.baseCurrency))
      throw new ApiError('خروجی حقوق ایران برای ارز ریال یا تومان است.', 422);
    const from = q.from ? validDate(q.from) : undefined,
      to = q.to ? validDate(q.to) : undefined;
    if (from && to && from > to) throw new ApiError('بازهٔ تاریخ معتبر نیست.', 422);
    const records = await db.record.findMany({
      where: {
        ...recordWhere(s, 'payroll'),
        postedAt: { not: null },
        reversedAt: null,
        ...(q.month ? { data: { path: ['month'], equals: String(q.month) } } : {}),
        ...(from || to
          ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      orderBy: [{ date: 'asc' }, { code: 'asc' }],
    });
    const employees = await db.record.findMany({
      where: {
        companyId: s.companyId,
        module: 'employees',
        id: { in: records.map((r) => String((r.data as any).employeeId)) },
      },
    });
    const lookup = new Map(employees.map((e) => [e.id, e]));
    const rows = records.map((r) => {
      const d = r.data as any,
        c = d.calculationSnapshot || d,
        e = lookup.get(d.employeeId),
        person = d.employeeSnapshot || { ...(e?.data as any), name: e?.name, code: e?.code };
      const factor =
        c.baseCurrency === 'IRR'
          ? D(1)
          : c.baseCurrency === 'IRT'
            ? D(10)
            : D(company.baseCurrency === 'IRT' ? 10 : 1);
      const rial = (value: any) => money(D(value || 0).mul(factor));
      return {
        id: r.id,
        code: r.code,
        date: r.date?.toISOString().slice(0, 10),
        month: d.month,
        name: person.name || '',
        employeeCode: person.code || '',
        nationalId: person.nationalId || '',
        insuranceNumber: person.insuranceNumber || '',
        days: Number(c.days || d.days || 30),
        baseIRR: rial(c.base),
        benefitsIRR: rial(c.benefits),
        grossIRR: rial(c.gross || D(c.base).add(c.benefits || 0)),
        insuranceBaseIRR: money(c.insuranceBaseIRR || 0),
        employeeInsuranceIRR: rial(c.insurance),
        employerInsuranceIRR: rial(c.employerInsurance),
        taxableBaseIRR: money(c.taxableBaseIRR || 0),
        taxIRR: rial(c.tax),
        deductionsIRR: rial(c.deductions),
        netIRR: rial(r.total),
        currency: 'ریال',
        ruleName: c.ruleName || d.ruleName || '',
        ruleSource: c.ruleSource || d.ruleSource || '',
        mode: 'آزمایشی؛ غیرقابل ارسال رسمی',
      };
    });
    const sum = (key: keyof (typeof rows)[number]) =>
      money(rows.reduce((v, r) => v.add(D(r[key] || 0)), D(0)));
    return {
      rows,
      mode: 'local-preview',
      currency: 'IRR',
      summary: {
        count: rows.length,
        grossIRR: sum('grossIRR'),
        netIRR: sum('netIRR'),
        insuranceIRR: money(D(sum('employeeInsuranceIRR')).add(sum('employerInsuranceIRR'))),
        taxIRR: sum('taxIRR'),
      },
      notice: 'خروجی آزمایشی از فیش‌های قطعی؛ قالب رسمی بارگذاری بیمه یا مالیات نیست.',
    };
  }
  async list(p: Principal, s: Scope) {
    requirePermission(p, 'payroll.read');
    return {
      rows: await db.payrollRule.findMany({
        where: { companyId: s.companyId },
        orderBy: { from: 'desc' },
      }),
      sample: samplePayrollRules,
    };
  }
  async save(p: Principal, s: Scope, input: any) {
    requirePermission(p, 'payroll-rules.write');
    const rules = rulesSchema.safeParse(input.rules);
    if (!rules.success) throw new ApiError('ساختار قواعد حقوق معتبر نیست.', 422);
    const r = rules.data;
    if (
      D(r.hourlyDivisor).lte(0) ||
      D(r.insuranceCeilingMultiple).lt(1) ||
      D(r.overtimeMultiplier).lt(1) ||
      [
        'employeeInsurancePercent',
        'employerInsurancePercent',
        'unemploymentPercent',
        'insuranceTaxDeductionPercent',
      ].some((k) => D((r as any)[k]).gt(100))
    )
      throw new ApiError('ضرایب قواعد معتبر نیست.', 422);
    let last = D(0);
    for (let i = 0; i < r.taxBrackets.length; i++) {
      const b = r.taxBrackets[i];
      if (
        D(b.rate).gt(100) ||
        (b.upToIRR === null && i !== r.taxBrackets.length - 1) ||
        (b.upToIRR !== null && D(b.upToIRR).lte(last))
      )
        throw new ApiError('پلکان‌های مالیات باید صعودی و آخرین سقف نامحدود باشد.', 422);
      if (b.upToIRR !== null) last = D(b.upToIRR);
    }
    if (r.taxBrackets.at(-1)?.upToIRR !== null)
      throw new ApiError('آخرین پله باید بدون سقف باشد.', 422);
    const from = validDate(input.from),
      to = validDate(input.to);
    if (from > to || String(input.source || '').length < 10 || String(input.name || '').length < 2)
      throw new ApiError('بازه، نام و مرجع قاعده را وارد کنید.', 422);
    return transaction(`org:${s.organizationId}`, async (tx) => {
      await requireSubscription(tx, p);
      const rule = await tx.payrollRule.create({
        data: {
          organizationId: s.organizationId,
          companyId: s.companyId,
          name: String(input.name).slice(0, 150),
          from,
          to,
          source: String(input.source).slice(0, 2000),
          rules: json(r),
          verified: input.verified === true,
        },
      });
      await audit(
        tx,
        p,
        'payroll-rules.create',
        'نسخهٔ جدید قواعد حقوق ثبت شد',
        s.companyId,
        rule.id,
        undefined,
        { name: rule.name, source: rule.source, verified: rule.verified },
      );
      return rule;
    });
  }
  async preview(p: Principal, s: Scope, input: any) {
    requirePermission(p, 'payroll.write');
    return this.calculate(db, s, input, false);
  }
  async calculate(tx: Tx, s: Scope, input: any, posting = true) {
    const date = validDate(input.date);
    const rule = await tx.payrollRule.findFirst({
      where: {
        companyId: s.companyId,
        from: { lte: date },
        to: { gte: date },
        ...(input.ruleId ? { id: String(input.ruleId) } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!rule)
      throw new ApiError(
        'ابتدا قواعد حقوق این تاریخ را در تنظیمات حقوق تعریف کنید.',
        422,
        'PAYROLL_RULE_REQUIRED',
      );
    if (posting && !rule.verified)
      throw new ApiError(
        'قاعدهٔ حقوق هنوز توسط مدیر تأیید نشده است؛ پیش‌نمایش قابل استفاده است.',
        422,
        'UNVERIFIED_PAYROLL_RULE',
      );
    const company = await tx.company.findUniqueOrThrow({ where: { id: s.companyId } });
    const calc = calculatePayroll(input, rule.rules, company.baseCurrency);
    return {
      ...calc,
      ruleId: rule.id,
      ruleName: rule.name,
      ruleVerified: rule.verified,
      ruleSource: rule.source,
      ruleSnapshot: rule.rules,
    };
  }
}
