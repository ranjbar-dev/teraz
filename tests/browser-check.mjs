import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  locale: 'fa-IR',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await fs.mkdir('artifacts', { recursive: true });
await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'ورود به فضای کاری', exact: true }).click();
await page.waitForURL('**/dashboard');
await page.getByText('نبض مالی کسب‌وکار').waitFor();
await page.waitForTimeout(1800);
await page.mouse.move(0, 0);
await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true });
await page.goto('http://localhost:3000/sales');
await page.getByRole('heading', { name: 'فاکتورهای فروش', exact: true }).waitFor();
await page.locator('tbody tr').first().waitFor();
await page.screenshot({ path: 'artifacts/sales-desktop.png', fullPage: true });
await page.goto('http://localhost:3000/sales/new');
await page.getByRole('heading', { name: 'ثبت فاکتور فروش' }).waitFor();
await page.getByLabel('کالا ردیف 1').waitFor();
await page.screenshot({ path: 'artifacts/invoice-editor.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://localhost:3000/dashboard');
await page.getByText('نبض مالی کسب‌وکار').waitFor();
await page.waitForTimeout(1800);
await page.screenshot({ path: 'artifacts/dashboard-mobile.png', fullPage: true });
console.log(
  JSON.stringify({
    errors,
    horizontalOverflow: await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  }),
);
await browser.close();
