import test from 'node:test';
import assert from 'node:assert/strict';
import {
  invoiceTotals,
  bankBalance,
  scoped,
  round,
  entries,
  stockBalances,
} from '../src/lib/domain.ts';
const line = { id: 'l', quantity: 2, price: 100, discount: 10, tax: 10, debit: 0, credit: 0 };
test('invoice discounts apply before tax and totals stay precise', () => {
  assert.deepEqual(invoiceTotals({ lines: [line], discount: 20 }), {
    subtotal: 200,
    discount: 40,
    net: 160,
    tax: 16,
    total: 176,
  });
  assert.equal(
    invoiceTotals({ lines: [{ ...line, quantity: 3, price: 0.1, discount: 0, tax: 0 }] }).total,
    0.3,
  );
});
test('different tax rates receive proportional document discount', () => {
  const result = invoiceTotals({
    lines: [
      { ...line, quantity: 1, price: 100, discount: 0, tax: 10 },
      { ...line, quantity: 1, price: 100, discount: 0, tax: 20 },
    ],
    discount: 100,
  });
  assert.equal(result.tax, 15);
  assert.equal(result.total, 115);
});
test('scope isolates companies, branches and financial periods', () => {
  const rows = [
    { companyId: 'a', branchId: 'a1', yearId: 'y1' },
    { companyId: 'b', branchId: 'b1', yearId: 'y1' },
    { companyId: 'a', branchId: 'a2', yearId: 'y2' },
  ];
  assert.equal(scoped(rows, { companyId: 'a', branchId: 'a1', yearId: 'y1' }).length, 1);
  assert.equal(scoped(rows, { companyId: 'a', branchId: 'all', yearId: 'y2' }).length, 1);
  assert.equal(scoped(rows, { companyId: 'a', branchId: 'a1', yearId: 'y1' }, true).length, 2);
});
const empty = () => ({
  collections: Object.fromEntries(
    [
      'banks',
      'assets',
      'currencies',
      'stock',
      'products',
      'warehouses',
      'sales',
      'purchases',
      'sales-returns',
      'purchase-returns',
      'production',
      'boms',
      'receipts',
      'payments',
      'expenses',
      'income',
      'checks',
      'payroll',
      'project-costs',
      'transfers',
      'depreciation',
      'journals',
      'accounts',
    ].map((k) => [k, []]),
  ),
});
test('opening cash respects branch and financial year', () => {
  const db = empty();
  const bank = { id: 'bank', branchId: 'b1', yearId: 'y1', openingBalance: 500 };
  assert.equal(bankBalance(db, bank, { companyId: 'c', branchId: 'all', yearId: 'y1' }), 500);
  assert.equal(bankBalance(db, bank, { companyId: 'c', branchId: 'b2', yearId: 'y1' }), 0);
  assert.equal(bankBalance(db, bank, { companyId: 'c', branchId: 'all', yearId: 'y2' }), 0);
});
test('inter-branch stock transfers appear in both owning warehouses', () => {
  const db = empty();
  const base = { companyId: 'c', branchId: 'b1', yearId: 'y', status: 'تأیید شده' };
  db.collections.products.push({ ...base, id: 'p', type: 'کالا', cost: 10 });
  db.collections.warehouses.push({ ...base, id: 'w1' }, { ...base, id: 'w2', branchId: 'b2' });
  db.collections.stock.push(
    { ...base, id: 'opening', productId: 'p', warehouseId: 'w1', type: 'رسید', quantity: 10 },
    {
      ...base,
      id: 'transfer',
      productId: 'p',
      warehouseId: 'w1',
      destinationId: 'w2',
      type: 'انتقال',
      quantity: 3,
    },
  );
  assert.equal(stockBalances(db, { companyId: 'c', branchId: 'b1', yearId: 'y' })[0].quantity, 7);
  assert.equal(stockBalances(db, { companyId: 'c', branchId: 'b2', yearId: 'y' })[0].quantity, 3);
});
test('posting a sale balances ledger and reduces inventory; cancelling reverses both', () => {
  const db = empty();
  const base = {
    companyId: 'c',
    branchId: 'b',
    yearId: 'y',
    status: 'تأیید شده',
    date: '2026-05-01',
  };
  const scope = { companyId: 'c', branchId: 'all', yearId: 'y' };
  db.collections.products.push({
    ...base,
    id: 'p',
    name: 'کالا',
    cost: 40,
    type: 'کالا',
    minStock: 2,
  });
  db.collections.warehouses.push({ ...base, id: 'w', name: 'انبار' });
  db.collections.stock.push({
    ...base,
    id: 'opening',
    type: 'رسید',
    productId: 'p',
    warehouseId: 'w',
    quantity: 10,
  });
  db.collections.sales.push({
    ...base,
    id: 'sale',
    personId: 'person',
    warehouseId: 'w',
    exchangeRate: 2,
    lines: [{ ...line, productId: 'p', quantity: 2 }],
  });
  const es = entries(db, scope);
  assert.equal(round(es.reduce((s, e) => s + e.debit - e.credit, 0)), 0);
  assert.equal(stockBalances(db, scope)[0].quantity, 8);
  assert.equal(
    es.filter((e) => e.accountCode === '1201').reduce((s, e) => s + e.debit, 0),
    396,
  );
  db.collections.sales[0].status = 'لغو شده';
  assert.equal(stockBalances(db, scope)[0].quantity, 10);
  assert.equal(
    entries(db, scope).some((e) => e.source === 'sales'),
    false,
  );
});
