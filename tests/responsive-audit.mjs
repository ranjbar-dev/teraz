import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 360, height: 800 } });
try {
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'ورود به فضای کاری', exact: true }).click();
  await page.waitForURL('**/dashboard');
  const boot = await page.evaluate(() => fetch('/api/bootstrap').then((r) => r.json()));
  const failures = [];
  for (const route of [
    ...Object.keys(boot.lookups),
    'users',
    'users/new',
    ...Object.keys(boot.lookups).map((k) => `${k}/new`),
  ]) {
    await page.goto(`http://localhost:3000/${route}`, { waitUntil: 'networkidle' });
    const result = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      offenders: [...document.querySelectorAll('main *, .content *, .topbar *')]
        .filter((el) => !el.closest('.table-scroll') && !el.closest('.sidebar'))
        .map((el) => ({
          element: el.tagName,
          class: el.className,
          width: Math.round(el.getBoundingClientRect().width),
          left: Math.round(el.getBoundingClientRect().left),
          right: Math.round(el.getBoundingClientRect().right),
        }))
        .filter((el) => el.width > innerWidth || el.left < -1 || el.right > innerWidth + 1)
        .slice(0, 15),
    }));
    if (result.width > 361) {
      failures.push({ route, ...result });
      console.log(JSON.stringify({ route, ...result }));
    }
  }
  await fs.writeFile(
    'artifacts/review/responsive-audit.json',
    JSON.stringify({ width: 360, failures }, null, 2),
  );
  console.log(
    `All module lists and create forms inspected at 360px: ${failures.length} overflow failures.`,
  );
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
