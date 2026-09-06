import { selectValue } from './select-helper.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'ورود به فضای کاری', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.getByText('نبض مالی کسب‌وکار').waitFor();
  await page.goto('http://localhost:3000/sales/new', { waitUntil: 'networkidle' });
  await selectValue(page, page.getByLabel('ارز', { exact: true }), 'دلار');
  assert.equal(await page.getByLabel('نرخ تبدیل به تومان', { exact: true }).inputValue(), '95000');
  await page.getByLabel('تاریخ', { exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'امروز', exact: true }).click();
  await page.goto('http://localhost:3000/reports/journal', { waitUntil: 'networkidle' });
  const paginated = await page.locator('tbody tr').count();
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  const printed = await page.locator('tbody tr').count();
  assert.ok(printed > paginated);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await selectValue(page, page.getByLabel('انتخاب شعبه'), 'c1-branch-2');
  await page.goto('http://localhost:3000/reports/inventory', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('tbody .danger-text').count(), 0);
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(
    `Final smoke passed: immediate login, FX autofill, mobile calendar, ${printed} print rows, branch inventory.`,
  );
} finally {
  await browser.close();
}
