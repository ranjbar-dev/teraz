import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.REVIEW_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (dialog) => dialog.accept());
await fs.mkdir('artifacts/review', { recursive: true });
try {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'artifacts/review/login.png', fullPage: true });
  await page.getByRole('button', { name: 'ورود به فضای کاری', exact: true }).click();
  await page.waitForURL('**/dashboard');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of [
      'dashboard',
      'sales',
      'people',
      'sales/new',
      'reports',
      'reports/ledger',
      'settings',
      'help',
    ]) {
      await page.goto(`${base}/${route}`, { waitUntil: 'networkidle' });
      await page.locator('h1').waitFor();
      if (route === 'dashboard') await page.waitForTimeout(1200);
      assert.equal(await page.locator('select').count(), 0, `${route} has native select`);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        `${route} overflows at ${width}`,
      );
      await page.screenshot({
        path: `artifacts/review/${route.replaceAll('/', '-')}-${width}.png`,
        fullPage: true,
      });
      if (route === 'sales/new') {
        await page.getByLabel('کالا ردیف 1', { exact: true }).click();
        await page.locator('.select-search input').fill('۱۰۰');
        await page.screenshot({
          path: `artifacts/review/select-${width}.png`,
          fullPage: false,
          animations: 'disabled',
        });
        await page.locator('.select-search input').press('Escape');
      }
    }
  }
  assert.equal(errors.length, 0, errors.join('; '));
  console.log(
    'Review screenshots captured: desktop + mobile, 8 representative page families, no overflow or runtime errors.',
  );
} finally {
  await browser.close();
}
