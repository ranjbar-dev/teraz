import type { Database, Line, Row, Scope } from './types';

export const number = (v: unknown) => Number(v) || 0;
export const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const active = (r: Row) =>
  ['تأیید شده', 'پرداخت شده', 'وصول شده', 'تکمیل شده'].includes(String(r.status));
export function invoiceTotals(row: Partial<Row>) {
  const lines = (row.lines || []) as Line[];
  const subtotal = lines.reduce((s, l) => s + number(l.quantity) * number(l.price), 0);
  const lineDiscount = lines.reduce(
    (s, l) => s + (number(l.quantity) * number(l.price) * number(l.discount)) / 100,
    0,
  );
  const net = Math.max(0, subtotal - lineDiscount);
  const discount = Math.min(net, Math.max(0, number(row.discount)));
  const tax = lines.reduce(
    (s, l) =>
      s +
      (number(l.quantity) *
        number(l.price) *
        (1 - number(l.discount) / 100) *
        (net ? (net - discount) / net : 0) *
        number(l.tax)) /
        100,
    0,
  );
  return {
    subtotal: round(subtotal),
    discount: round(lineDiscount + discount),
    net: round(net - discount),
    tax: round(tax),
    total: round(net - discount + tax),
  };
}
export function amountOf(key: string, row: Row, db: Database): number {
  if (['sales', 'purchases', 'quotes', 'sales-returns', 'purchase-returns', 'boms'].includes(key))
    return invoiceTotals(row).total;
  if (key === 'payroll')
    return round(
      number(row.base) +
        number(row.benefits) -
        number(row.insurance) -
        number(row.tax) -
        number(row.deductions),
    );
  if (key === 'depreciation') {
    const a = db.collections.assets.find((a) => a.id === row.assetId);
    return a
      ? round(
          ((number(a.cost) - number(a.salvage)) / Math.max(1, number(a.life))) * number(row.months),
        )
      : 0;
  }
  if (key === 'journals')
    return round(((row.lines || []) as Line[]).reduce((s, l) => s + number(l.debit), 0));
  return number(row.amount);
}
export function scoped(rows: Row[], scope: Scope, master = false) {
  return rows.filter(
    (r) =>
      r.companyId === scope.companyId &&
      (master ||
        ((!scope.branchId || scope.branchId === 'all' || r.branchId === scope.branchId) &&
          (!scope.yearId || r.yearId === scope.yearId))),
  );
}
export type Entry = {
  id: string;
  date: string;
  code: string;
  description: string;
  accountCode: string;
  debit: number;
  credit: number;
  personId: string;
  source: string;
  sourceId: string;
  branchId: string;
};
export function entries(db: Database, scope: Scope): Entry[] {
  const out: Entry[] = [];
  const add = (r: Row, source: string, accountCode: string, debit: number, credit: number) => {
    if (debit || credit)
      out.push({
        id: `${source}-${r.id}-${out.length}`,
        date: String(r.date || '2026-03-21'),
        code: String(r.code || 'افتتاحیه'),
        description: String(r.name || r.notes || source),
        accountCode,
        debit: round(debit),
        credit: round(credit),
        personId: String(r.personId || ''),
        source,
        sourceId: r.id,
        branchId: r.branchId,
      });
  };
  const rows = (key: string) => scoped(db.collections[key] || [], scope).filter(active);
  const base = (r: Row) => number(r.exchangeRate) || 1;
  const pair = (r: Row, key: string, dr: string, cr: string, amount: number) => {
    add(r, key, dr, amount, 0);
    add(r, key, cr, 0, amount);
  };
  for (const r of scoped(db.collections.banks, scope)) {
    const rate =
      r.exchangeRate ||
      db.collections.currencies.find(
        (c) => c.companyId === scope.companyId && c.name === r.currency,
      )?.rate ||
      1;
    pair(r, 'banks', '1101', '3101', number(r.openingBalance) * number(rate));
  }
  for (const r of scoped(db.collections.assets, scope))
    pair(r, 'assets', '1501', '3101', number(r.cost));
  for (const key of ['sales', 'purchases', 'sales-returns', 'purchase-returns'])
    for (const r of rows(key)) {
      const t = invoiceTotals(r),
        x = base(r),
        isSale = key === 'sales' || key === 'sales-returns',
        reverse = key.endsWith('returns');
      const put = (account: string, dr: number, cr: number) =>
        add(r, key, account, (reverse ? cr : dr) * x, (reverse ? dr : cr) * x);
      if (isSale) {
        put('1201', t.total, 0);
        put('4101', 0, t.net);
        put('2102', 0, t.tax);
        const cost = (r.lines as Line[]).reduce((s, l) => {
          const p = db.collections.products.find((p) => p.id === l.productId);
          return s + (p?.type === 'خدمت' ? 0 : number(l.quantity) * number(p?.cost));
        }, 0);
        add(r, key, '5101', reverse ? 0 : cost, reverse ? cost : 0);
        add(r, key, '1301', reverse ? cost : 0, reverse ? 0 : cost);
      } else {
        put('1301', t.net, 0);
        put('1202', t.tax, 0);
        put('2101', 0, t.total);
      }
    }
  for (const r of rows('receipts'))
    pair(r, 'receipts', '1101', '1201', amountOf('receipts', r, db) * base(r));
  for (const r of rows('payments'))
    pair(r, 'payments', '2101', '1101', amountOf('payments', r, db) * base(r));
  for (const r of rows('expenses')) pair(r, 'expenses', '5102', '1101', number(r.amount) * base(r));
  for (const r of rows('income')) pair(r, 'income', '1101', '4102', number(r.amount) * base(r));
  for (const r of rows('checks'))
    if (r.status === 'وصول شده')
      pair(
        r,
        'checks',
        r.type === 'دریافتی' ? '1101' : '2101',
        r.type === 'دریافتی' ? '1201' : '1101',
        number(r.amount) * base(r),
      );
  for (const r of rows('payroll')) {
    const gross = number(r.base) + number(r.benefits),
      net = amountOf('payroll', r, db);
    add(r, 'payroll', '5103', gross, 0);
    add(r, 'payroll', '2103', 0, gross - net);
    add(r, 'payroll', r.status === 'پرداخت شده' ? '1101' : '2104', 0, net);
  }
  for (const r of rows('depreciation'))
    pair(r, 'depreciation', '5104', '1502', amountOf('depreciation', r, db));
  for (const r of rows('project-costs'))
    pair(
      r,
      'project-costs',
      r.type === 'هزینه' ? '5102' : '1101',
      r.type === 'هزینه' ? '1101' : '4102',
      number(r.amount),
    );
  for (const r of rows('stock')) {
    const p = db.collections.products.find((p) => p.id === r.productId);
    const v = number(p?.cost) * number(r.quantity);
    if (r.type === 'رسید') pair(r, 'stock', '1301', '3101', v);
    if (r.type === 'حواله') pair(r, 'stock', '5102', '1301', v);
  }
  for (const r of rows('production'))
    if (number(r.overhead)) pair(r, 'production', '1301', '2101', number(r.overhead));
  for (const r of rows('journals'))
    for (const l of (r.lines || []) as Line[]) {
      const a = db.collections.accounts.find((a) => a.id === l.accountId);
      if (a)
        add(
          { ...r, name: l.title || r.name },
          'journals',
          String(a.code),
          number(l.debit),
          number(l.credit),
        );
    }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export function stockBalances(db: Database, scope: Scope) {
  // Warehouse ownership determines the branch view; inter-branch transfers
  // still contribute to both warehouses from the same company-wide movement.
  const inventoryScope = { ...scope, branchId: 'all' };
  const result: {
    id: string;
    productId: string;
    warehouseId: string;
    name: string;
    code: string;
    warehouse: string;
    quantity: number;
    minStock: number;
    value: number;
    unit: string;
  }[] = [];
  for (const p of scoped(db.collections.products, scope, true).filter((p) => p.type !== 'خدمت'))
    for (const w of scoped(db.collections.warehouses, scope, true).filter(
      (w) => !scope.branchId || scope.branchId === 'all' || w.branchId === scope.branchId,
    ))
      result.push({
        id: `${p.id}-${w.id}`,
        productId: p.id,
        warehouseId: w.id,
        name: String(p.name),
        code: String(p.code),
        warehouse: String(w.name),
        quantity: 0,
        minStock: number(p.minStock),
        value: 0,
        unit: String(p.unit),
      });
  const change = (product: unknown, warehouse: unknown, quantity: number) => {
    const r = result.find((r) => r.productId === product && r.warehouseId === warehouse);
    if (r) r.quantity += quantity;
  };
  for (const r of scoped(db.collections.stock, inventoryScope).filter(active)) {
    change(r.productId, r.warehouseId, number(r.quantity) * (r.type === 'رسید' ? 1 : -1));
    if (r.type === 'انتقال') change(r.productId, r.destinationId, number(r.quantity));
  }
  for (const key of ['sales', 'purchases', 'sales-returns', 'purchase-returns'])
    for (const r of scoped(db.collections[key], inventoryScope).filter(active))
      for (const l of (r.lines || []) as Line[])
        change(
          l.productId,
          r.warehouseId,
          number(l.quantity) * (['sales', 'purchase-returns'].includes(key) ? -1 : 1),
        );
  for (const r of scoped(db.collections.production, inventoryScope).filter(
    (r) => r.status === 'تکمیل شده',
  )) {
    const bom = db.collections.boms.find((b) => b.id === r.bomId);
    if (bom) {
      change(bom.productId, r.warehouseId, number(r.quantity));
      for (const l of (bom.lines || []) as Line[])
        change(l.productId, r.warehouseId, -number(l.quantity) * number(r.quantity));
    }
  }
  return result.map((r) => ({
    ...r,
    quantity: round(r.quantity),
    value: round(
      r.quantity * number(db.collections.products.find((p) => p.id === r.productId)?.cost),
    ),
  }));
}
export function bankBalance(db: Database, bank: Row, scope: Scope) {
  let total =
    (!scope.yearId || bank.yearId === scope.yearId) &&
    (scope.branchId === 'all' || !scope.branchId || scope.branchId === bank.branchId)
      ? number(bank.openingBalance)
      : 0;
  for (const key of [
    'receipts',
    'payments',
    'expenses',
    'income',
    'checks',
    'payroll',
    'project-costs',
  ])
    for (const r of scoped(db.collections[key], scope).filter(active)) {
      if (r.bankId !== bank.id || (key === 'payroll' && r.status !== 'پرداخت شده')) continue;
      const sign =
        ['receipts', 'income'].includes(key) ||
        (key === 'checks' && r.type === 'دریافتی') ||
        (key === 'project-costs' && r.type === 'درآمد')
          ? 1
          : -1;
      total += sign * amountOf(key, r, db);
    }
  for (const r of scoped(db.collections.transfers, scope).filter(active)) {
    if (r.fromBankId === bank.id) total -= number(r.amount);
    if (r.toBankId === bank.id) total += number(r.amount);
  }
  return round(total);
}
