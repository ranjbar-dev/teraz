import assert from 'node:assert/strict';
import path from 'node:path';

export async function testTours(browser, base, artifact) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'fa-IR',
  });
  try {
    const slug = 'tour-' + Date.now();
    const registered = await context.request.post(base + '/api/auth/register', {
      data: {
        email: slug + '@test.local',
        password: 'Tour-test-password-2026!',
        name: 'کاربر آموزش',
        organizationName: 'سازمان آموزش',
        slug,
      },
    });
    assert.equal(registered.status(), 200);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/dashboard');
    await page.getByRole('heading', { name: 'به تراز خوش آمدید' }).waitFor();
    assert.equal(
      await page.locator('.tour-panel').evaluate((el) => el === document.activeElement),
      true,
    );
    await page.getByRole('button', { name: 'بعدی', exact: true }).click();
    await page.getByRole('heading', { name: 'محدودهٔ اطلاعات را انتخاب کنید' }).waitFor();
    assert.equal(await page.locator('.topbar-right.tour-highlight').count(), 1);
    await page.getByRole('button', { name: 'قبلی', exact: true }).click();
    await page.getByRole('heading', { name: 'به تراز خوش آمدید' }).waitFor();
    await page.screenshot({ path: path.join(artifact, 'tour-desktop.png') });
    // Failed persistence is explicit and retryable, without trapping the user.
    await page.route('**/api/onboarding*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'آزمون قطع ارتباط' }),
          })
        : route.continue(),
    );
    await page.getByRole('button', { name: 'فعلاً رد می‌کنم' }).click();
    await page.locator('.tour-save-error').waitFor();
    assert.equal(await page.locator('.tour-panel').count(), 0);
    await page.unroute('**/api/onboarding*');
    await page.locator('.tour-save-error button').click();
    await page.locator('.tour-save-error').waitFor({ state: 'hidden' });
    assert.equal((await (await context.request.get(base + '/api/onboarding')).json()).seen, true);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('.tour-panel').count(), 0);
    // A clean browser storage context must also honor the server's saved status.
    const returning = await browser.newContext();
    await returning.addCookies(await context.cookies());
    const anotherPage = await returning.newPage();
    await anotherPage.goto(base + '/dashboard', { waitUntil: 'networkidle' });
    assert.equal(await anotherPage.locator('.tour-panel').count(), 0);
    await returning.close();
    await page.goto(base + '/help');
    await page.getByRole('button', { name: 'اجرای دوبارهٔ شروع سریع' }).click();
    for (let i = 0; i < 5; i++)
      await page.getByRole('button', { name: 'بعدی', exact: true }).click();
    await page.getByRole('button', { name: 'پایان آموزش' }).click();
    await page.locator('.tour-links').getByRole('link', { name: 'اشخاص و طرف حساب‌ها' }).click();
    await page.locator('.tour-panel').waitFor();
    assert.match(page.url(), /people\?tour=page/);
    await page.keyboard.press('Escape');
    await page.locator('.tour-panel').waitFor({ state: 'hidden' });
    await page.goto(base + '/people/new');
    await page.getByRole('button', { name: 'راهنمای این صفحه' }).click();
    await page.getByRole('button', { name: 'بعدی', exact: true }).click();
    await page.getByRole('heading', { name: 'تکمیل اطلاعات' }).waitFor();
    await page.keyboard.press('Escape');
    await page.goto(base + '/dashboard');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'راهنمای این صفحه' }).click();
    await page.screenshot({ path: path.join(artifact, 'tour-mobile.png') });
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'Mobile overflow',
    );
    const box = await page.locator('.tour-panel').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844);
    await page.getByRole('button', { name: 'بستن آموزش' }).click();
    assert.deepEqual(errors, []);
    console.log(
      'Tour browser checks passed: first run, retry, persistence, replay, page/form guide, keyboard and mobile.',
    );
  } finally {
    await context.close();
  }
}
