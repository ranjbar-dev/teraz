import {
  entries,
  scoped,
  stockBalances,
  number,
  round,
  active,
  invoiceTotals,
  bankBalance,
} from './domain';
import type { Database, Scope } from './types';
import { toJalaali, toGregorian } from 'jalaali-js';

export function report(
  db: Database,
  scope: Scope,
  key: string,
  from = '',
  to = '',
  accountId = '',
) {
  const all = entries(db, scope).filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
  const accounts = scoped(db.collections.accounts, scope, true);
  const balances = accounts.map((a) => {
    const list = all.filter((e) => e.accountCode === a.code);
    const debit = round(list.reduce((s, e) => s + e.debit, 0)),
      credit = round(list.reduce((s, e) => s + e.credit, 0));
    return {
      id: a.id,
      code: String(a.code),
      name: String(a.name),
      type: String(a.type),
      debit,
      credit,
      balance: round(debit - credit),
    };
  });
  const sumType = (type: string) =>
    round(balances.filter((a) => a.type === type).reduce((s, a) => s + a.balance, 0));
  const revenue = -sumType('درآمد'),
    expenses = sumType('هزینه'),
    profit = round(revenue - expenses);
  if (key === 'profit-loss')
    return {
      rows: balances
        .filter((a) => ['درآمد', 'هزینه'].includes(a.type))
        .map((a) => ({ ...a, amount: a.type === 'درآمد' ? -a.balance : a.balance })),
      summary: [
        { label: 'کل درآمد', value: revenue },
        { label: 'کل هزینه', value: expenses },
        { label: 'سود خالص', value: profit },
      ],
    };
  if (key === 'balance-sheet')
    return {
      rows: [
        ...balances
          .filter((a) => ['دارایی', 'بدهی', 'سرمایه'].includes(a.type))
          .map((a) => ({ ...a, amount: a.type === 'دارایی' ? a.balance : -a.balance })),
        { id: 'profit', code: '۳۹۰۱', name: 'سود (زیان) دوره', type: 'سرمایه', amount: profit },
      ],
      summary: [
        { label: 'دارایی‌ها', value: sumType('دارایی') },
        { label: 'بدهی‌ها', value: -sumType('بدهی') },
        { label: 'حقوق مالکانه', value: -sumType('سرمایه') + profit },
        {
          label: 'اختلاف تراز',
          value: round(sumType('دارایی') + sumType('بدهی') + sumType('سرمایه') - profit),
        },
      ],
    };
  if (key === 'trial-balance')
    return {
      rows: balances.map((a) => ({
        ...a,
        debitBalance: Math.max(0, a.balance),
        creditBalance: Math.max(0, -a.balance),
      })),
      summary: [
        { label: 'جمع بدهکار', value: all.reduce((s, e) => s + e.debit, 0) },
        { label: 'جمع بستانکار', value: all.reduce((s, e) => s + e.credit, 0) },
        { label: 'اختلاف', value: round(all.reduce((s, e) => s + e.debit - e.credit, 0)) },
      ],
    };
  if (['journal', 'ledger'].includes(key)) {
    let running = 0;
    const selected = accounts.find((a) => a.id === accountId);
    const rows = all
      .filter((e) => !selected || e.accountCode === selected.code)
      .map((e) => {
        running = round(running + e.debit - e.credit);
        return {
          ...e,
          account: String(accounts.find((a) => a.code === e.accountCode)?.name || e.accountCode),
          balance: running,
        };
      });
    return {
      rows,
      summary: [
        { label: 'تعداد ثبت', value: rows.length, unit: 'ثبت' },
        { label: 'گردش بدهکار', value: rows.reduce((s, e) => s + e.debit, 0) },
        { label: 'گردش بستانکار', value: rows.reduce((s, e) => s + e.credit, 0) },
      ],
    };
  }
  if (key === 'receivables') {
    const rows = scoped(db.collections.people, scope, true).map((p) => {
      const es = all.filter((e) => e.personId === p.id && ['1201', '2101'].includes(e.accountCode));
      const balance = round(es.reduce((s, e) => s + e.debit - e.credit, 0));
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        phone: p.phone,
        debit: Math.max(0, balance),
        credit: Math.max(0, -balance),
        balance,
      };
    });
    return {
      rows,
      summary: [
        { label: 'مانده بدهکاران', value: rows.reduce((s, r) => s + r.debit, 0) },
        { label: 'مانده بستانکاران', value: rows.reduce((s, r) => s + r.credit, 0) },
      ],
    };
  }
  if (key === 'inventory') {
    const copy = {
      ...db,
      collections: Object.fromEntries(
        Object.entries(db.collections).map(([k, v]) => [
          k,
          v.filter((r) => !to || !r.date || String(r.date) <= to),
        ]),
      ),
    };
    const rows = stockBalances(copy, scope);
    return {
      rows,
      summary: [
        { label: 'ارزش موجودی', value: rows.reduce((s, r) => s + r.value, 0) },
        { label: 'تعداد کالا', value: new Set(rows.map((r) => r.productId)).size, unit: 'کالا' },
        {
          label: 'نیازمند تأمین',
          value: rows.filter((r) => r.quantity < r.minStock).length,
          unit: 'مورد',
        },
      ],
    };
  }
  if (key === 'cashflow') {
    const rows = all
      .filter((e) => e.accountCode === '1101')
      .map((e) => ({ ...e, amount: e.debit - e.credit }));
    return {
      rows,
      summary: [
        { label: 'ورودی وجه', value: rows.reduce((s, r) => s + r.debit, 0) },
        { label: 'خروجی وجه', value: rows.reduce((s, r) => s + r.credit, 0) },
        { label: 'خالص جریان', value: rows.reduce((s, r) => s + r.amount, 0) },
      ],
    };
  }
  if (key === 'tax') {
    const rows = ['sales', 'purchases', 'sales-returns', 'purchase-returns'].flatMap((k) =>
      scoped(db.collections[k], scope)
        .filter(
          (r) => active(r) && (!from || String(r.date) >= from) && (!to || String(r.date) <= to),
        )
        .map((r) => ({
          id: r.id,
          code: r.code,
          date: r.date,
          name: String(db.collections.people.find((p) => p.id === r.personId)?.name || ''),
          type: (
            {
              sales: 'فروش',
              purchases: 'خرید',
              'sales-returns': 'برگشت از فروش',
              'purchase-returns': 'برگشت از خرید',
            } as Record<string, string>
          )[k],
          amount: invoiceTotals(r).net * (number(r.exchangeRate) || 1),
          tax:
            invoiceTotals(r).tax * (number(r.exchangeRate) || 1) * (k.endsWith('returns') ? -1 : 1),
          side: k.startsWith('sale') ? 1 : -1,
        })),
    );
    return {
      rows,
      summary: [
        {
          label: 'مالیات فروش',
          value: rows.filter((r) => r.side === 1).reduce((s, r) => s + r.tax, 0),
        },
        {
          label: 'اعتبار مالیات خرید',
          value: rows.filter((r) => r.side === -1).reduce((s, r) => s + r.tax, 0),
        },
        { label: 'خالص مالیات', value: rows.reduce((s, r) => s + r.tax * r.side, 0) },
      ],
    };
  }
  if (key === 'project-profit') {
    const rows = scoped(db.collections.projects, scope, true).map((p) => {
      const tx = scoped(db.collections['project-costs'], scope).filter(
        (r) =>
          r.projectId === p.id &&
          active(r) &&
          (!from || String(r.date) >= from) &&
          (!to || String(r.date) <= to),
      );
      const cost = tx.filter((r) => r.type === 'هزینه').reduce((s, r) => s + number(r.amount), 0),
        income = tx.filter((r) => r.type === 'درآمد').reduce((s, r) => s + number(r.amount), 0);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        budget: number(p.budget),
        cost,
        income,
        profit: income - cost,
        remaining: number(p.budget) - cost,
        progress: p.progress,
      };
    });
    return {
      rows,
      summary: [
        { label: 'بودجه کل', value: rows.reduce((s, r) => s + r.budget, 0) },
        { label: 'هزینه انجام‌شده', value: rows.reduce((s, r) => s + r.cost, 0) },
        { label: 'سود پروژه‌ها', value: rows.reduce((s, r) => s + r.profit, 0) },
      ],
    };
  }
  return { rows: [], summary: [] };
}

export function dashboard(db: Database, scope: Scope, months = 6) {
  const fiscal = db.collections['fiscal-years'].find((y) => y.id === scope.yearId);
  const start = String(fiscal?.startDate || '2026-03-21');
  const end = String(fiscal?.endDate || '2027-03-20');
  const all = entries(db, scope);
  const jy = toJalaali(new Date(start + 'T12:00:00')).jy;
  const iso = (y: number, m: number) => {
    const g = toGregorian(y, m, 1);
    return `${g.gy}-${String(g.gm).padStart(2, '0')}-${String(g.gd).padStart(2, '0')}`;
  };
  const monthKeys = Array.from({ length: months }, (_, i) => ({
    from: iso(jy, i + 1),
    to: i === 11 ? iso(jy + 1, 1) : iso(jy, i + 2),
  }));
  const chart = monthKeys.map(({ from, to }) => {
    const es = all.filter((e) => e.date >= from && e.date < to);
    return {
      month: from,
      income: round(
        es
          .filter((e) => ['4101', '4102'].includes(e.accountCode))
          .reduce((s, e) => s + e.credit - e.debit, 0),
      ),
      expense: round(
        es.filter((e) => e.accountCode.startsWith('5')).reduce((s, e) => s + e.debit - e.credit, 0),
      ),
    };
  });
  const sales = scoped(db.collections.sales, scope)
    .filter(active)
    .reduce((s, r) => s + invoiceTotals(r).total * (number(r.exchangeRate) || 1), 0);
  const receivables = report(db, scope, 'receivables').summary;
  const banks = scoped(db.collections.banks, scope, true).map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    currency: b.currency,
    balance: bankBalance(db, b, scope),
  }));
  const balance = banks.reduce(
    (s, b) =>
      s +
      b.balance *
        number(
          db.collections.currencies.find(
            (c) => c.companyId === scope.companyId && c.name === b.currency,
          )?.rate || 1,
        ),
    0,
  );
  const profit = report(db, scope, 'profit-loss').summary[2]?.value || 0;
  const recent = scoped(db.collections.sales, scope)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 6)
    .map((r) => ({
      ...r,
      person: db.collections.people.find((p) => p.id === r.personId)?.name || '',
      total: invoiceTotals(r).total,
    }));
  const categories = ['5101', '5102', '5103', '5104'].map((code) => ({
    name: String(
      db.collections.accounts.find((a) => a.companyId === scope.companyId && a.code === code)
        ?.name || '',
    ),
    value: round(
      all.filter((e) => e.accountCode === code).reduce((s, e) => s + e.debit - e.credit, 0),
    ),
  }));
  const checks = scoped(db.collections.checks, scope)
    .filter((r) => r.status === 'در جریان')
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .map((r) => ({ ...r, person: db.collections.people.find((p) => p.id === r.personId)?.name }));
  const inventory = stockBalances(db, scope);
  return {
    sales,
    balance,
    profit,
    receivables: receivables[0]?.value || 0,
    payables: receivables[1]?.value || 0,
    chart,
    banks,
    recent,
    categories,
    checks,
    lowStock: inventory.filter((r) => r.quantity < r.minStock),
    activities: db.audit
      .filter((a) => a.companyId === scope.companyId)
      .slice(-5)
      .reverse(),
    start,
    end,
  };
}
