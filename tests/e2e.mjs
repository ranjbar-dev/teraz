import { selectValue } from './select-helper.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
const base = 'http://localhost:3100';
const testId = String(Date.now());
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--port', '3100'],
  {
    env: { ...process.env, TARAZ_DATA_DIR: `.data-test/${testId}` },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
let logs = '';
server.stdout.on('data', (d) => {
  logs += d;
});
server.stderr.on('data', (d) => {
  logs += d;
});
let browser;
let assertions = 0;
const ok = (v, message) => {
  assert.ok(v, message);
  assertions++;
};
const scope = 'companyId=c1&branchId=all&yearId=c1-year-1405';
let cookie = '';
async function request(
  route,
  method = 'GET',
  body,
  expected = 200,
  customScope = scope,
  customCookie = cookie,
) {
  const res = await fetch(`${base}/api/${route}${route.includes('?') ? '&' : '?'}${customScope}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: customCookie, Origin: base },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  assert.equal(res.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
  assertions++;
  return { data, res };
}
async function login(role) {
  const { res } = await request('auth', 'POST', {
    email: `${role}@taraz.app`,
    password: 'Taraz1405!',
  });
  return res.headers.get('set-cookie').split(';')[0];
}
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${base}/login`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
    if (i === 79) throw new Error(logs);
  }
  cookie = await login('admin');
  const { data: boot } = await request('bootstrap');
  const keys = [...Object.keys(boot.lookups), 'users'];
  for (const key of keys) {
    const { data } = await request(key);
    ok(Array.isArray(data.rows) && data.rows.length, `${key} has sample rows`);
  }
  console.log(`API: ${keys.length} modules loaded.`);
  const reportKeys = [
    'profit-loss',
    'balance-sheet',
    'trial-balance',
    'journal',
    'ledger',
    'receivables',
    'inventory',
    'cashflow',
    'tax',
    'project-profit',
  ];
  for (const key of reportKeys) {
    const { data } = await request(`reports/${key}`);
    ok(data.rows.length > 0, `${key} has calculated results`);
    if (key === 'trial-balance' || key === 'balance-sheet')
      ok(Math.abs(data.summary.at(-1).value) < 0.02, `${key} balances`);
  }
  const { data: foreign } = await request(
    'sales',
    'GET',
    undefined,
    200,
    'companyId=c2&branchId=all&yearId=c2-year-1405',
  );
  ok(
    foreign.rows.every((r) => r.companyId === 'c2'),
    'company isolation',
  );
  const { data: branch } = await request(
    'sales',
    'GET',
    undefined,
    200,
    'companyId=c1&branchId=c1-branch-2&yearId=c1-year-1405',
  );
  ok(
    branch.rows.every((r) => r.branchId === 'c1-branch-2') && branch.rows.length < 30,
    'branch isolation',
  );
  const { data: closed } = await request(
    'dashboard',
    'GET',
    undefined,
    200,
    'companyId=c1&branchId=all&yearId=c1-year-1404',
  );
  ok(closed.sales === 0 && closed.balance === 0, 'year isolation includes opening balances');
  const { data: person } = await request(
    'people',
    'POST',
    { code: 'TEST-P', name: 'آزمایش جریان کامل', type: 'مشتری', status: 'فعال' },
    201,
  );
  await request(`people/${person.id}`, 'PATCH', { name: 'آزمایش ویرایش' });
  const { data: inventoryBefore } = await request('reports/inventory');
  const before = inventoryBefore.rows.find(
    (r) => r.productId === 'c1-product-0' && r.warehouseId === 'c1-warehouse-1',
  ).quantity;
  const invoice = {
    code: 'TEST-S',
    personId: person.id,
    date: '2026-09-06',
    dueDate: '2026-09-20',
    currency: 'تومان',
    exchangeRate: 1,
    warehouseId: 'c1-warehouse-1',
    discount: 100000,
    lines: [
      {
        id: 'test-line',
        productId: 'c1-product-0',
        title: 'کالای آزمایشی',
        quantity: 2,
        price: 8500000,
        discount: 5,
        tax: 10,
      },
    ],
    status: 'تأیید شده',
  };
  const { data: sale } = await request('sales', 'POST', invoice, 201);
  ok(sale.total === 17655000, 'invoice total includes both discounts and tax');
  const { data: inventoryAfter } = await request('reports/inventory');
  ok(
    inventoryAfter.rows.find(
      (r) => r.productId === 'c1-product-0' && r.warehouseId === 'c1-warehouse-1',
    ).quantity ===
      before - 2,
    'invoice affects stock',
  );
  await request('people/' + person.id, 'DELETE', undefined, 400);
  await request(
    'sales',
    'POST',
    { ...invoice, code: 'TEST-FOREIGN', personId: 'c2-person-1' },
    400,
  );
  await request(
    'sales',
    'POST',
    { ...invoice, code: 'TEST-CLOSED', date: '2025-05-01', dueDate: '2025-05-20' },
    400,
    'companyId=c1&branchId=all&yearId=c1-year-1404',
  );
  await request(
    'sales',
    'POST',
    { ...invoice, code: 'TEST-STOCK', lines: [{ ...invoice.lines[0], quantity: 999999 }] },
    400,
  );
  const { data: receipt } = await request(
    'receipts',
    'POST',
    {
      code: 'TEST-R',
      personId: person.id,
      date: '2026-09-06',
      amount: 5000000,
      currency: 'تومان',
      exchangeRate: 1,
      bankId: 'c1-bank-1',
      invoiceId: sale.id,
      method: 'انتقال بانکی',
      status: 'تأیید شده',
    },
    201,
  );
  const { data: paid } = await request('sales/' + sale.id);
  ok(
    paid.remaining === 12655000 && paid.paid === 5000000,
    'partial receipt updates invoice settlement',
  );
  await request('sales/' + sale.id, 'PATCH', { status: 'لغو شده' }, 400);
  await request('receipts', 'POST', { ...receipt, code: 'TEST-OVERPAY', amount: 20000000 }, 400);
  await request(
    'journals',
    'POST',
    {
      code: 'TEST-UNBALANCED',
      name: 'سند نامتوازن',
      date: '2026-09-06',
      status: 'تأیید شده',
      lines: [
        { id: 'a', accountId: 'c1-account-1101', debit: 100, credit: 0 },
        { id: 'b', accountId: 'c1-account-3101', debit: 0, credit: 90 },
      ],
    },
    400,
  );
  await request('receipts/' + receipt.id, 'PATCH', { status: 'لغو شده' });
  await request('receipts/' + receipt.id, 'DELETE');
  await request('sales/' + sale.id, 'PATCH', { status: 'لغو شده' });
  await request('sales/' + sale.id, 'DELETE');
  await request('people/' + person.id, 'DELETE');
  const { data: trial } = await request('reports/trial-balance');
  ok(Math.abs(trial.summary[2].value) < 0.02, 'ledger remains balanced after reversals');
  const viewer = await login('viewer');
  await request('people', 'POST', { code: 'NO', name: 'NO' }, 403, scope, viewer);
  await request('users', 'GET', undefined, 403, scope, viewer);
  await request('sales', 'GET', undefined, 200, scope, viewer);
  const accountant = await login('accountant');
  await request('settings', 'PATCH', { taxRate: 20 }, 403, scope, accountant);
  console.log('API: ledger, inventory, settlements, validation and permissions passed.');
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    locale: 'fa-IR',
  });
  const page = await context.newPage();
  const coverage = [];
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'ورود به فضای کاری', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.getByText('نبض مالی کسب‌وکار').waitFor();
  for (const key of keys) {
    await page.goto(`${base}/${key}`, { waitUntil: 'networkidle' });
    await page.locator('h1').waitFor();
    ok((await page.locator('tbody tr').count()) > 0, `${key} list rendered`);
    ok((await page.locator('select').count()) === 0, `${key} list uses searchable selects`);
    await page.goto(`${base}/${key}/new`, { waitUntil: 'networkidle' });
    await page.locator('form.entity-form').waitFor();
    ok((await page.locator('select').count()) === 0, `${key} form uses searchable selects`);
    ok(
      (await page.getByRole('button', { name: new RegExp('ذخیره') }).count()) > 0,
      `${key} creation form rendered`,
    );
    const first = key === 'users' ? (await request('users')).data.rows[0] : boot.lookups[key][0];
    await page.goto(`${base}/${key}/${first.id}`, { waitUntil: 'networkidle' });
    await page.locator('.document-panel').waitFor();
    ok((await page.locator('select').count()) === 0, `${key} details use searchable selects`);
    await page.goto(`${base}/${key}/${first.id}/edit`, { waitUntil: 'networkidle' });
    ok(
      (await page.locator('form.entity-form, .empty-state').count()) > 0,
      `${key} edit or posted-document protection rendered`,
    );
    coverage.push({
      module: key,
      list: true,
      create: true,
      detail: true,
      edit: true,
      nativeSelects: 0,
    });
  }
  await fs.mkdir('artifacts/review', { recursive: true });
  await fs.writeFile(
    'artifacts/review/coverage.json',
    JSON.stringify(
      { testedAt: new Date().toISOString(), modules: coverage, reports: reportKeys },
      null,
      2,
    ),
  );
  console.log(
    `Browser: list, create, detail and edit pages for all ${keys.length} modules passed.`,
  );
  for (const key of reportKeys) {
    await page.goto(`${base}/reports/${key}`, { waitUntil: 'networkidle' });
    await page.locator('.report-summary').waitFor();
    ok((await page.locator('tbody tr').count()) > 0, `${key} report rendered`);
  }
  await page.goto(`${base}/people`, { waitUntil: 'networkidle' });
  await page.getByLabel('جست‌وجوی نام', { exact: true }).fill('نوآوران');
  ok((await page.locator('tbody tr').count()) === 1, 'column search narrows results');
  await page.getByLabel('جست‌وجوی نام', { exact: true }).fill('');
  await page.getByLabel('جست‌وجوی کد', { exact: true }).fill('P-۱۰۰۱');
  ok((await page.locator('tbody tr').count()) === 1, 'Persian digits normalize in search');
  const downloadWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'خروجی اکسل', exact: true }).click();
  const download = await downloadWait;
  const exportPath = await download.path();
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(exportPath);
  ok(book.worksheets[0].rowCount === 2, 'Excel contains filtered row and header');
  await page.goto(`${base}/people/new`, { waitUntil: 'networkidle' });
  await page.getByLabel('کد', { exact: true }).fill('UI-TEST');
  await page.getByLabel('نام', { exact: true }).fill('شخص تست مرورگر');
  await page.getByRole('button', { name: 'ذخیره طرف حساب', exact: true }).click();
  await page.locator('.document-panel').waitFor();
  ok(
    (await page.locator('.document-panel').getByText('شخص تست مرورگر', { exact: true }).count()) >
      0,
    'UI create submitted through API',
  );
  await page.getByRole('link', { name: 'ویرایش', exact: true }).click();
  await page.getByLabel('نام', { exact: true }).fill('نام ویرایش‌شده');
  await page.getByRole('button', { name: 'ذخیره طرف حساب', exact: true }).click();
  await page.locator('.document-panel').waitFor();
  ok(
    (await page.locator('.document-panel').getByText('نام ویرایش‌شده', { exact: true }).count()) >
      0,
    'UI edit persisted',
  );
  await page.getByRole('button', { name: 'حذف رکورد' }).click();
  await page.getByRole('button', { name: 'تأیید و ادامه' }).click();
  await page.waitForURL('**/people');
  await page.goto(`${base}/sales/new`, { waitUntil: 'networkidle' });
  await page.getByLabel('طرف حساب', { exact: true }).click();
  await page.locator('.select-search input').fill('بدون نتیجه xyz');
  ok(
    await page.getByText('گزینه‌ای پیدا نشد', { exact: true }).isVisible(),
    'select has useful empty state',
  );
  await page.locator('.select-search input').fill('P-۱۰۰۱');
  ok(
    (await page.getByRole('option').count()) === 1,
    'select normalizes Persian digits and searches codes',
  );
  await page.locator('.select-search input').press('Enter');
  ok(
    (await page
      .getByLabel('طرف حساب', { exact: true })
      .locator('..')
      .getAttribute('data-value')) === 'c1-person-0',
    'select keyboard Enter chooses result',
  );
  await page.getByLabel('طرف حساب', { exact: true }).press('ArrowDown');
  await page.locator('.select-search input').press('Escape');
  ok(
    await page
      .getByLabel('طرف حساب', { exact: true })
      .evaluate((el) => el === document.activeElement),
    'Escape restores trigger focus',
  );
  await page.getByRole('link', { name: 'بازگشت', exact: true }).click();
  await page.getByRole('dialog', { name: 'تغییرات ذخیره نشده' }).waitFor();
  await page.getByRole('button', { name: 'انصراف', exact: true }).last().click();
  ok(page.url().endsWith('/sales/new'), 'unsaved navigation can be cancelled');
  await selectValue(page, page.getByLabel('انتخاب شرکت', { exact: true }), 'c2');
  await page.getByRole('dialog', { name: 'تغییرات ذخیره نشده' }).waitFor();
  await page.getByRole('button', { name: 'انصراف', exact: true }).last().click();
  ok(
    (await page
      .getByLabel('انتخاب شرکت', { exact: true })
      .locator('..')
      .getAttribute('data-value')) === 'c1',
    'company switch protects unsaved work',
  );
  await selectValue(page, page.getByLabel('طرف حساب', { exact: true }), 'c1-person-1');
  await selectValue(page, page.getByLabel('انبار', { exact: true }), 'c1-warehouse-1');
  await selectValue(page, page.getByLabel('کالا ردیف 1'), 'c1-product-2');
  await page.getByLabel('تعداد ردیف 1').fill('2');
  await page.getByLabel('تاریخ', { exact: true }).click();
  await selectValue(page, page.getByLabel('سال تقویم', { exact: true }), '1405', '۱۴۰۵');
  ok(
    await page.locator('.calendar-popover').isVisible(),
    'calendar remains open after portalled year selection',
  );
  await page.getByRole('button', { name: 'امروز', exact: true }).click();
  await page.getByRole('button', { name: 'ذخیره فاکتور فروش', exact: true }).click();
  await page.locator('.document-panel').waitFor();
  ok(
    (await page.locator('.document-lines tbody tr').count()) === 1,
    'UI invoice line editor saves',
  );
  await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle' });
  await selectValue(page, page.getByLabel('انتخاب شرکت'), 'c2');
  await page.getByText('نبض مالی کسب‌وکار').waitFor();
  ok(
    (
      await page.getByLabel('سال مالی', { exact: true }).locator('..').getAttribute('data-value')
    ).startsWith('c2-'),
    'company switch resets fiscal year',
  );
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of [
      'dashboard',
      'sales',
      'sales/new',
      'reports',
      'reports/trial-balance',
      'settings',
      'help',
    ]) {
      await page.goto(`${base}/${route}`, { waitUntil: 'networkidle' });
      await page.locator('h1').waitFor();
      ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${route} fits ${viewport.width}px`,
      );
    }
  }
  await page.goto(`${base}/people/does-not-exist/edit`, { waitUntil: 'networkidle' });
  ok(
    await page.getByText('بارگذاری اطلاعات انجام نشد').isVisible(),
    'missing edit record shows recovery state',
  );
  await page.goto(`${base}/sales/new`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'ذخیره فاکتور فروش', exact: true }).click();
  ok(
    (await page.locator('.select-invalid').count()) > 0,
    'required custom selects participate in form validation',
  );
  ok(
    await page.locator('.select-search input').evaluate((el) => el === document.activeElement),
    'first invalid select opens and receives focus',
  );
  await page.locator('.select-search input').press('Escape');
  await selectValue(page, page.getByLabel('سال مالی', { exact: true }), 'c2-year-1404');
  await page.getByText('سال مالی بسته است', { exact: true }).waitFor();
  ok(
    (await page.locator('form.entity-form').count()) === 0,
    'closed year explains why editing is unavailable',
  );
  await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
  await selectValue(
    page,
    page.getByRole('combobox', { name: 'نمایش اعداد', exact: true }),
    'لاتین',
  );
  await page.getByRole('button', { name: 'ذخیره تغییرات', exact: true }).click();
  await page.getByText('تنظیمات شرکت ذخیره شد.', { exact: true }).waitFor();
  await page.reload({ waitUntil: 'networkidle' });
  ok(
    (await page
      .getByRole('combobox', { name: 'نمایش اعداد', exact: true })
      .locator('..')
      .getAttribute('data-value')) === 'لاتین',
    'search select settings persist after reload',
  );
  ok(errors.length === 0, `no browser runtime errors: ${errors.join('; ')}`);
  await fs.writeFile(
    'artifacts/review/test-result.json',
    JSON.stringify(
      {
        passed: true,
        assertions,
        modules: keys.length,
        reports: reportKeys.length,
        isolatedData: `.data-test/${testId}`,
        testedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`PASS: ${assertions} assertions. Data isolated in .data-test/${testId}.`);
} catch (e) {
  console.error(e);
  console.error(logs.slice(-5000));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill();
}
