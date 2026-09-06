import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..'),
  base = 'http://localhost:3100';
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, '.runtime/browser-fixture.json'), 'utf8'),
);
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'backend/src/catalog.json'), 'utf8'));
const artifact = path.join(root, 'artifacts/backend-review');
fs.mkdirSync(artifact, { recursive: true });
const log = fs.openSync(path.join(root, '.runtime/browser-web.log'), 'a');
const server = spawn(
  process.execPath,
  [
    path.join(root, 'node_modules/next/dist/bin/next'),
    'start',
    '--port',
    '3100',
    '--hostname',
    '127.0.0.1',
  ],
  {
    cwd: root,
    env: { ...process.env, BACKEND_URL: 'http://127.0.0.1:4001' },
    windowsHide: true,
    stdio: ['ignore', log, log],
  },
);
let browser;
const failures = [],
  visited = [];
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base + '/login')).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({
    headless: true,
    channel: String.fromCharCode(99, 104, 114, 111, 109, 101),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'fa-IR',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) =>
    failures.push({ type: 'javascript', url: page.url(), error: e.message }),
  );
  const cookie = (value) => ({
    name: 'taraz-session',
    value: value.split('=')[1],
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
  await context.addCookies([cookie(fixture.cookie)]);
  await page.addInitScript(
    (scope) => localStorage.setItem('taraz-scope', JSON.stringify(scope)),
    fixture.scope,
  );
  const check = async (route) => {
    const res = await page.goto(base + route, { waitUntil: 'networkidle' });
    assert.equal(res.status(), 200, route);
    await page
      .locator('.loading-screen .spinner')
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
    const errors = await page.locator('[role=alert],.form-error').allTextContents();
    for (const error of errors) if (error.trim()) failures.push({ route, error });
    assert.equal(await page.locator('select').count(), 0, 'Native select ' + route);
    visited.push(route);
  };
  for (const mod of catalog.modules) {
    await check('/' + mod.key);
    await check('/' + mod.key + '/new');
    const record = fixture.records[mod.key];
    if (record) {
      await check('/' + mod.key + '/' + record.id);
      await check('/' + mod.key + '/' + record.id + '/edit');
    }
  }
  for (const r of catalog.reports) await check('/reports/' + r.key);
  for (const r of [
    'dashboard',
    'reports',
    'settings',
    'activity',
    'help',
    'subscription',
    'profile',
    'integrations',
    'payroll-rules',
    'period-close',
  ])
    await check('/' + r);
  await check('/dashboard');
  await page.screenshot({ path: path.join(artifact, 'dashboard-desktop.png'), fullPage: true });
  await check('/subscription');
  await page.screenshot({ path: path.join(artifact, 'subscription-desktop.png'), fullPage: true });
  await context.addCookies([cookie(fixture.platformCookie)]);
  await check('/platform');
  await page.screenshot({ path: path.join(artifact, 'platform-desktop.png'), fullPage: true });
  await page.getByRole('button', { name: 'ساخت سازمان', exact: true }).click();
  await page.getByLabel('نام سازمان', { exact: true }).fill('سازمان ساخته‌شده از مرورگر');
  await page.getByLabel('نشانی لاتین سازمان', { exact: true }).fill('browser-' + Date.now());
  await page.getByLabel('نام مدیر', { exact: true }).fill('مدیر مرورگر');
  await page
    .getByLabel('ایمیل مدیر', { exact: true })
    .fill('browser-' + Date.now() + '@test.local');
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await page.getByRole('heading', { name: 'سازمان آماده است' }).waitFor();
  await page.getByRole('button', { name: 'اطلاعات را نگه داشتم' }).click();
  await page.getByRole('button', { name: 'پلن‌های اشتراک', exact: true }).click();
  await page.getByRole('button', { name: 'پلن جدید', exact: true }).click();
  await page.getByLabel('نام پلن', { exact: true }).fill('پلن مرورگر');
  await page.getByLabel('قیمت · ریال', { exact: true }).fill('1000000');
  await page.getByRole('button', { name: 'ذخیره', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 390, height: 844 });
  await check('/platform');
  await page.screenshot({ path: path.join(artifact, 'platform-mobile.png'), fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'Platform mobile overflow',
  );
  await context.clearCookies();
  for (const r of ['login', 'register', 'forgot-password', 'reset-password', 'accept-invitation'])
    await check('/' + r);
  await check('/login');
  await page.screenshot({ path: path.join(artifact, 'login-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await check('/register');
  await page.screenshot({ path: path.join(artifact, 'register-desktop.png'), fullPage: true });
  assert.deepEqual(failures, []);
  console.log(
    'Browser coverage passed: ' +
      visited.length +
      ' page visits; platform create organization and create plan; desktop/mobile.',
  );
} finally {
  await browser?.close();
  server.kill();
  fs.writeFileSync(
    path.join(artifact, 'browser-report.json'),
    JSON.stringify({ visited, failures, generatedAt: new Date().toISOString() }, null, 2),
  );
}
