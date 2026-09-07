import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db, D, transaction } from '../src/core';
import { BillingService } from '../src/platform';
import { SmsIrClient } from '../src/smsir';
import { depreciationPeriod } from '../src/accounting';
import { calculatePayroll, samplePayrollRules } from '../src/payroll';
import { modules } from '../src/core';
import { processJob, encryptModian } from '../src/integrations';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateKeyPairSync, privateDecrypt, createDecipheriv, constants } from 'node:crypto';
const base = 'http://127.0.0.1:4001/api';
type Client = { cookie: string; scope: Record<string, string> };
async function call(
  c: Client,
  path: string,
  method = 'GET',
  body?: any,
  expected = 200,
  headers: Record<string, string> = {},
) {
  const q = new URLSearchParams(c.scope);
  const res = await fetch(`${base}/${path}${path.includes('?') ? '&' : '?'}${q}`, {
    method,
    headers: { cookie: c.cookie, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await res.json();
  assert.equal(res.status, expected, `${method} ${path}: ${JSON.stringify(json)}`);
  return { data: json, cookie: res.headers.get('set-cookie')?.split(';')[0] || c.cookie };
}
const empty = { cookie: '', scope: {} };
after(() => db.$disconnect());
test('real PostgreSQL + HTTP accounting and SaaS workflows', async (t) => {
  const ownerLogin = await call(empty, 'auth/login', 'POST', {
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
  });
  const platform = { cookie: ownerLogin.cookie, scope: {} };
  const plans = (await call(empty, 'plans')).data.rows;
  assert.equal(plans.length, 3);
  const slug = 'test-' + randomUUID().slice(0, 8);
  const login = await call(empty, 'auth/register', 'POST', {
    email: slug + '@test.local',
    password: 'Test-private-password-2026!',
    name: 'مدیر آزمون',
    organizationName: 'سازمان آزمون',
    slug,
  });
  const c: Client = { cookie: login.cookie, scope: {} };
  let boot = (await call(c, 'bootstrap')).data;
  c.scope = { companyId: boot.scope.companyId, branchId: 'all', yearId: boot.scope.yearId };
  const date = boot.years[0].startDate;
  const created: Record<string, any> = {};
  let serial = 0;
  const create = async (key: string, input: any, status?: string) => {
    const data = (
      await call(
        c,
        key,
        'POST',
        { code: `T-${++serial}`, date, ...input, ...(status ? { status } : {}) },
        201,
      )
    ).data;
    created[key] = data;
    return data;
  };
  await t.test('session, platform boundary, tenant isolation and CSRF', async () => {
    await call(empty, 'bootstrap', 'GET', undefined, 401);
    await call(c, 'platform', 'GET', undefined, 403);
    await call(c, 'people', 'POST', {}, 403, { origin: 'https://evil.invalid' });
    const other = await call(empty, 'auth/register', 'POST', {
      email: 'other-' + slug + '@test.local',
      password: 'Other-private-password!',
      name: 'مدیر دوم',
      organizationName: 'سازمان دوم',
      slug: 'other-' + slug,
    });
    const d = { cookie: other.cookie, scope: {} };
    const otherBoot = (await call(d, 'bootstrap')).data;
    await call(
      { ...c, scope: { ...c.scope, companyId: otherBoot.scope.companyId } },
      'people',
      'GET',
      undefined,
      404,
    );
  });
  const person = await create('people', { name: 'مشتری آزمون', type: 'هر دو' });
  const product = await create('products', {
    name: 'کالای آزمون',
    price: '200',
    cost: '100',
    type: 'کالا',
    unit: 'عدد',
    minStock: '2',
  });
  const service = await create('products', {
    name: 'خدمت آزمون',
    price: '30',
    cost: '0',
    type: 'خدمت',
    unit: 'ساعت',
  });
  const warehouse = await create('warehouses', { name: 'انبار آزمون' });
  const bank = await create('banks', {
    name: 'بانک آزمون',
    type: 'بانک',
    currency: 'تومان',
    exchangeRate: '1',
    openingBalance: '10000',
  });
  const invoice = {
    personId: person.id,
    warehouseId: warehouse.id,
    currency: 'تومان',
    exchangeRate: '1',
    discount: '0',
    dueDate: date,
    lines: [
      {
        productId: product.id,
        title: 'کالا',
        quantity: '10',
        price: '100',
        discount: '0',
        tax: '10',
      },
    ],
  };
  let purchase: any, sale: any, receipt: any;
  await t.test('purchase posts balanced journal and moving average stock', async () => {
    purchase = await create('purchases', invoice, 'تأیید شده');
    const inv = (await call(c, 'reports/inventory')).data;
    assert.equal(inv.rows[0].quantity, '10.000000');
    assert.equal(inv.rows[0].value, '1000.000000');
    const trial = (await call(c, 'reports/trial-balance')).data;
    assert.equal(trial.summary[2].value, '0.000000');
  });
  await t.test('sales, COGS, partial allocation and exact monetary strings', async () => {
    sale = await create(
      'sales',
      { ...invoice, lines: [{ ...invoice.lines[0], quantity: '3', price: '200' }] },
      'تأیید شده',
    );
    assert.equal(sale.total, '660');
    receipt = await create(
      'receipts',
      {
        personId: person.id,
        bankId: bank.id,
        invoiceId: sale.id,
        currency: 'تومان',
        exchangeRate: '1',
        amount: '200',
        method: 'انتقال بانکی',
      },
      'تأیید شده',
    );
    const current = (await call(c, 'sales/' + sale.id)).data;
    assert.equal(current.paid, '200.000000');
    assert.equal(current.remaining, '460.000000');
    const profit = (await call(c, 'reports/profit-loss')).data;
    assert.equal(profit.summary[2].value, '300.000000');
  });
  await t.test('posted records and ledger immutable at API and SQL levels', async () => {
    await call(c, 'sales/' + sale.id, 'PATCH', { status: 'پیش‌نویس', version: sale.version }, 409);
    await call(c, 'sales/' + sale.id, 'DELETE', undefined, 409);
    await assert.rejects(db.record.update({ where: { id: sale.id }, data: { total: '1' } }));
    const journal = await db.journal.findFirstOrThrow({
      where: { sourceId: sale.id },
      include: { lines: true },
    });
    await assert.rejects(
      db.journalLine.update({ where: { id: journal.lines[0].id }, data: { debit: '1' } }),
    );
    await call(c, 'accounts/' + journal.lines[0].accountId, 'DELETE', undefined, 409);
  });
  await t.test('idempotency and stale edit protection', async () => {
    const key = randomUUID(),
      body = { code: 'IDEMPOTENT', name: 'طرف حساب تکرارپذیر' };
    const a = (await call(c, 'people', 'POST', body, 201, { 'idempotency-key': key })).data;
    const b = (await call(c, 'people', 'POST', body, 201, { 'idempotency-key': key })).data;
    assert.equal(a.id, b.id);
    await call(c, 'people', 'POST', { ...body, name: 'دیگر' }, 409, { 'idempotency-key': key });
    await call(c, 'people/' + a.id, 'PATCH', { name: 'جدید', version: a.version });
    await call(c, 'people/' + a.id, 'PATCH', { name: 'قدیمی', version: a.version }, 409);
  });
  await t.test('concurrent overselling only permits available stock', async () => {
    const body = {
      ...invoice,
      status: 'تأیید شده',
      lines: [{ ...invoice.lines[0], quantity: '5', price: '200' }],
    };
    const responses = await Promise.all(
      [1, 2].map((i) =>
        fetch(`${base}/sales?${new URLSearchParams(c.scope)}`, {
          method: 'POST',
          headers: { cookie: c.cookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, code: 'CONCURRENT-' + i, date }),
        }),
      ),
    );
    const statuses = responses.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 422]);
    const inv = (await call(c, 'reports/inventory')).data;
    assert.equal(inv.rows[0].quantity, '2.000000');
  });
  await t.test('reversal dependencies, reversal entries and restored allocations', async () => {
    await call(c, `sales/${sale.id}/reverse`, 'POST', { date, reason: 'اصلاح آزمایشی' }, 409);
    await call(c, `receipts/${receipt.id}/reverse`, 'POST', { date, reason: 'اصلاح دریافت' });
    const r = (await call(c, 'sales/' + sale.id)).data;
    assert.equal(r.paid, '0.000000');
    await call(c, `sales/${sale.id}/reverse`, 'POST', { date, reason: 'اصلاح فروش' });
    const inv = (await call(c, 'reports/inventory')).data;
    assert.equal(inv.rows[0].quantity, '5.000000');
    assert.equal((await call(c, 'reports/trial-balance')).data.summary[2].value, '0.000000');
  });
  await t.test('all report routes operate on real ledgers', async () => {
    for (const key of [
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
    ]) {
      const r = (await call(c, 'reports/' + key)).data;
      assert.ok(Array.isArray(r.rows));
      assert.ok(Array.isArray(r.summary));
    }
    assert.equal((await call(c, 'reports/balance-sheet')).data.summary[3].value, '0.000000');
    await call(c, 'dashboard');
  });
  await t.test('payroll rule approval and server calculation', async () => {
    const employee = await create('employees', {
      name: 'کارمند آزمون',
      salary: '20000000',
      nationalId: '0012345678',
      position: 'حسابدار',
      hireDate: date,
    });
    const rule = (
      await call(c, 'payroll-rules', 'POST', {
        name: 'قاعده آزمون محاسبه، نه تأیید قانونی',
        from: date,
        to: boot.years[0].endDate,
        source: 'TEST FIXTURE ONLY — not a legal source',
        verified: true,
        rules: samplePayrollRules,
      })
    ).data;
    const calculated = calculatePayroll(
      { base: '20000000', benefits: '0', days: 30 },
      samplePayrollRules,
      'IRT',
    );
    const payslip = await create(
      'payroll',
      {
        employeeId: employee.id,
        base: '20000000',
        benefits: '0',
        days: 30,
        month: 'فروردین',
        bankId: bank.id,
        ruleId: rule.id,
      },
      'تأیید شده',
    );
    assert.equal(D(payslip.total).toString(), D(calculated.total).toString());
    await call(c, 'payroll/' + payslip.id, 'PATCH', {
      status: 'پرداخت شده',
      version: payslip.version,
    });
    await call(c, 'payroll-calculate', 'POST', { base: '1', date, days: 30 }, 422);
  });
  await t.test('super admin creates organizations and subscription enforcement', async () => {
    const newOrg = (
      await call(
        platform,
        'platform/organizations',
        'POST',
        {
          name: 'سازمان پنل',
          slug: 'panel-' + slug,
          ownerName: 'مدیر پنل',
          ownerEmail: 'panel-' + slug + '@test.local',
          planId: plans[0].id,
          days: 30,
        },
        201,
      )
    ).data;
    assert.ok(newOrg.owner.temporaryPassword.length >= 12);
    const organizationId = boot.scope.organizationId;
    await call(platform, 'platform/organizations/' + organizationId, 'PATCH', {
      subscriptionStatus: 'SUSPENDED',
    });
    await call(c, 'people', 'POST', { code: 'DENIED', name: 'نباید ذخیره شود' }, 402);
    await call(c, 'reports/trial-balance');
    await call(c, 'subscription');
    await call(platform, 'platform/organizations/' + organizationId, 'PATCH', {
      subscriptionStatus: 'ACTIVE',
    });
  });
  await t.test('provider callback idempotency extends once after verified response', async () => {
    const p = {
      userId: boot.user.id,
      name: boot.user.name,
      email: boot.user.email,
      organizationId: boot.scope.organizationId,
      superAdmin: false,
      role: 'OWNER',
      companyIds: [],
      permissions: [],
      sessionId: '',
    };
    const service = new BillingService(async (method) =>
      method === 'request'
        ? { data: { code: 100, authority: 'S' + randomUUID().replaceAll('-', '') } }
        : { data: { code: 100, ref_id: '123456789' } },
    );
    const payment = await service.checkout(p, { planId: plans[0].id });
    const row = await db.billingPayment.findUniqueOrThrow({ where: { id: payment.paymentId } });
    const before = await db.subscription.findUniqueOrThrow({
      where: { organizationId: p.organizationId },
    });
    await Promise.all([service.verify(row.authority!, 'OK'), service.verify(row.authority!, 'OK')]);
    const after = await db.subscription.findUniqueOrThrow({
      where: { organizationId: p.organizationId },
    });
    assert.equal(after.endsAt.getTime() - before.endsAt.getTime(), row.durationDays * 86400000);
  });
  await t.test(
    'all module list/create/read/update paths, including references and BOM',
    async () => {
      const fixtures: Record<string, any> = {
        people: { name: 'طرف حساب جامع' },
        products: { name: 'محصول جامع', type: 'کالا', price: '50', cost: '20' },
        warehouses: { name: 'انبار دوم' },
        banks: {
          name: 'حساب دوم',
          type: 'صندوق',
          currency: 'تومان',
          exchangeRate: '1',
          openingBalance: '0',
        },
        employees: {
          name: 'عضو تیم',
          nationalId: '0012345679',
          salary: '20000000',
          position: 'کارشناس',
          hireDate: date,
        },
        assets: { name: 'رایانه', cost: '12000', salvage: '0', life: '12', purchaseDate: date },
        projects: {
          name: 'پروژه جامع',
          budget: '5000',
          personId: person.id,
          dueDate: boot.years[0].endDate,
        },
        branches: { name: 'شعبه دوم' },
        currencies: { name: 'دلار', rate: '95000' },
        accounts: { name: 'حساب جامع', type: 'هزینه', level: 'معین' },
        companies: { name: 'شرکت دوم', baseCurrency: 'IRT' },
        users: {
          name: 'مشاهده‌گر جامع',
          email: slug + '-viewer@test.local',
          password: 'Viewer-private-password!',
          role: 'مشاهده‌گر',
        },
        'fiscal-years': { name: 'سال بعد', startDate: '2027-03-21', endDate: '2028-03-19' },
      };
      for (const mod of modules) {
        if (!fixtures[mod.key]) continue;
        if (mod.key === 'currencies') {
          const existing = boot.lookups.currencies.find((r: any) => r.name === 'دلار');
          created.currencies = (
            await call(c, 'currencies/' + existing.id, 'PATCH', {
              ...fixtures.currencies,
              version: existing.version,
            })
          ).data;
          continue;
        }
        const row = await create(mod.key, fixtures[mod.key]);
        await call(c, mod.key + '/' + row.id);
        if (mod.key !== 'users')
          await call(c, mod.key + '/' + row.id, 'PATCH', {
            ...fixtures[mod.key],
            version: row.version,
            notes: 'ویرایش آزمایشی',
          });
      }
      const refs: Record<string, string> = {
        people: person.id,
        products: product.id,
        warehouses: warehouse.id,
        banks: bank.id,
        employees: created.employees.id,
        assets: created.assets.id,
        projects: created.projects.id,
        accounts: created.accounts.id,
        branches: boot.branches[0].id,
      };
      for (const key of [
        'quotes',
        'stock',
        'transfers',
        'checks',
        'expenses',
        'income',
        'depreciation',
        'boms',
        'production',
        'project-costs',
        'journals',
        'sales-returns',
        'purchase-returns',
      ]) {
        const mod = modules.find((m) => m.key === key)!;
        const input: any = {};
        for (const f of mod.fields) {
          if (f.ref) input[f.key] = refs[f.ref] || '';
          else if (f.type === 'date') input[f.key] = date;
          else if (f.options) input[f.key] = f.default || f.options[0];
          else if (['money', 'number'].includes(f.type || ''))
            input[f.key] = String(f.min && f.min > 1 ? f.min : 1);
          else if (f.required) input[f.key] = 'آزمون';
        }
        if (key === 'transfers') {
          input.fromBankId = bank.id;
          input.toBankId = created.banks.id;
        }
        if (key === 'stock') input.type = 'رسید';
        if (key === 'boms') {
          input.productId = created.products.id;
          input.lines = [
            { productId: product.id, quantity: '1', price: '0', discount: '0', tax: '0' },
          ];
        }
        if (key === 'production') input.bomId = created.boms.id;
        if (key === 'quotes' || key.endsWith('returns')) {
          Object.assign(input, invoice, { discount: '0' });
          if (key === 'sales-returns') {
            const actual = await db.record.findFirstOrThrow({
              where: {
                companyId: c.scope.companyId,
                module: 'sales',
                postedAt: { not: null },
                reversedAt: null,
              },
            });
            input.originalInvoiceId = actual.id;
            input.lines = [{ ...invoice.lines[0], quantity: '1', price: '200' }];
          }
          if (key === 'purchase-returns') {
            input.originalInvoiceId = purchase.id;
            input.lines = [{ ...invoice.lines[0], quantity: '1' }];
          }
        }
        if (key === 'journals')
          input.lines = [
            {
              accountId: boot.lookups.accounts.find((a: any) => a.code === '1100').id,
              debit: '1',
              credit: '0',
              title: 'بدهکار',
            },
            { accountId: created.accounts.id, debit: '0', credit: '1', title: 'بستانکار' },
          ];
        if (key === 'checks') input.status = 'در جریان';
        const row = await create(key, input);
        await call(c, key + '/' + row.id);
        if (!row.postedAt) {
          const updated = (
            await call(c, key + '/' + row.id, 'PATCH', {
              ...input,
              version: row.version,
              notes: 'ویرایش سند',
            })
          ).data;
          created[key] = updated;
        }
      }
      await create(
        'payments',
        {
          personId: person.id,
          bankId: bank.id,
          invoiceId: purchase.id,
          currency: 'تومان',
          exchangeRate: '1',
          amount: '100',
        },
        'تأیید شده',
      );
      for (const mod of modules) {
        const rows = (await call(c, mod.key)).data.rows;
        assert.ok(rows.length > 0, mod.key + ' populated');
      }
      const converted = (await call(c, `quotes/${created.quotes.id}/convert`, 'POST', {})).data;
      assert.ok(converted.id);
      const again = (await call(c, `quotes/${created.quotes.id}/convert`, 'POST', {})).data;
      assert.equal(again.id, converted.id);
    },
  );
  await t.test('posting every financial workflow keeps ledgers balanced', async () => {
    for (const key of [
      'stock',
      'transfers',
      'expenses',
      'income',
      'depreciation',
      'production',
      'project-costs',
      'journals',
      'sales-returns',
      'purchase-returns',
    ]) {
      const row = created[key];
      const posted = (await call(c, `${key}/${row.id}/post`, 'POST', { version: row.version }))
        .data;
      assert.ok(posted.postedAt, key);
      created[key] = posted;
    }
    const check = created.checks;
    await call(c, `checks/${check.id}`, 'PATCH', { status: 'وصول شده', version: check.version });
    await call(c, `checks/${check.id}/reverse`, 'POST', { date, reason: 'آزمون برگشت چک' });
    assert.equal((await call(c, 'reports/trial-balance')).data.summary[2].value, '0.000000');
    assert.equal((await call(c, 'reports/balance-sheet')).data.summary[3].value, '0.000000');
  });
  await t.test(
    'viewer access, password reset single use and encrypted local integration outbox',
    async () => {
      const login = await call(empty, 'auth/login', 'POST', {
        email: slug + '-viewer@test.local',
        password: 'Viewer-private-password!',
      });
      const viewer = { cookie: login.cookie, scope: c.scope };
      await call(viewer, 'bootstrap');
      await call(viewer, 'sales');
      await call(viewer, 'sales', 'POST', {}, 403);
      await call(viewer, 'users', 'GET', undefined, 403);
      await call(c, 'integrations/smsir', 'PATCH', {
        mode: 'dry-run',
        enabled: true,
        config: { apiKey: 'test-secret-do-not-expose' },
      });
      const config = (await call(c, 'integrations')).data;
      assert.ok(!JSON.stringify(config).includes('test-secret'));
      const job = (
        await call(c, 'integrations/smsir', 'POST', {
          mobile: '09123456789',
          message: 'پیام آزمایشی محلی',
        })
      ).data;
      await processJob();
      const state = await db.integrationJob.findUniqueOrThrow({ where: { id: job.id } });
      assert.equal(state.status, 'DRY_RUN');
      const token = randomUUID();
      const { hash } = await import('../src/core');
      await db.passwordReset.create({
        data: {
          userId: created.users.id,
          tokenHash: hash(token),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      await call(empty, 'auth/reset', 'POST', { token, password: 'Changed-viewer-password!' });
      await call(empty, 'auth/reset', 'POST', { token, password: 'Changed-viewer-password!' }, 422);
      await call(viewer, 'sales', 'GET', undefined, 401);
    },
  );
  await t.test('private attachment isolation and file type validation', async () => {
    const file = (
      await call(
        c,
        'attachments',
        'POST',
        {
          recordId: created.people.id,
          name: 'test.pdf',
          base64: Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
        },
        201,
      )
    ).data;
    const list = (await call(c, 'attachments?recordId=' + created.people.id)).data;
    assert.equal(list.rows[0].id, file.id);
    await call(
      c,
      'attachments',
      'POST',
      {
        recordId: created.people.id,
        name: 'bad.html',
        base64: Buffer.from('<script>bad</script>').toString('base64'),
      },
      422,
    );
    await call(c, 'attachments/' + file.id, 'DELETE');
  });
  await t.test(
    'JWE uses authenticated encryption and decrypts with the recipient key',
    async () => {
      const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      const encoded = encryptModian(
        'signed-test-invoice',
        publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
        'key-1',
      );
      const [header, wrapped, iv, ciphertext, tag] = encoded.split('.');
      const cek = privateDecrypt(
        { key: privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        Buffer.from(wrapped, 'base64url'),
      );
      const decipher = createDecipheriv('aes-256-gcm', cek, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(header));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      assert.equal(
        Buffer.concat([
          decipher.update(Buffer.from(ciphertext, 'base64url')),
          decipher.final(),
        ]).toString(),
        'signed-test-invoice',
      );
    },
  );
  await t.test(
    'sms.ir adapter validates the authenticated template contract and rejection',
    async () => {
      const client = new SmsIrClient('contract-test-key', (async (url, init) => {
        assert.equal(url, 'https://api.sms.ir/v1/send/verify');
        assert.equal(new Headers(init?.headers).get('X-API-KEY'), 'contract-test-key');
        assert.deepEqual(JSON.parse(String(init?.body)), {
          mobile: '09123456789',
          templateId: 123,
          parameters: [{ name: 'CODE', value: '123456' }],
        });
        return new Response(JSON.stringify({ status: 1, data: { messageId: 42, cost: 100 } }));
      }) as typeof fetch);
      assert.equal(
        (await client.verify('09123456789', 123, [{ name: 'CODE', value: '123456' }])).messageId,
        42,
      );
      const rejected = new SmsIrClient(
        'test',
        (async () => new Response(JSON.stringify({ status: 0 }))) as typeof fetch,
      );
      await assert.rejects(
        rejected.verify('09123456789', 123, [{ name: 'CODE', value: '123456' }]),
      );
      await assert.rejects(client.verify('invalid', 123, [{ name: 'CODE', value: '123456' }]));
    },
  );
  // Browser coverage uses the same isolated database and authenticated sessions.
  await t.test(
    'SQL search uses bound values, Persian normalization and numerical ordering',
    async () => {
      const literal = await create('people', { name: 'مشتری كيان ۱۲۳ %_' });
      const result = (await call(c, 'people?limit=1&q=' + encodeURIComponent('کیان 123 %_'))).data;
      assert.equal(result.totalCount, 1);
      assert.equal(result.rows[0].id, literal.id);
      await call(c, 'people?limit=1&filters=bad', 'GET', undefined, 422);
      await call(
        c,
        'people?limit=1&sort=' + encodeURIComponent('name; DROP TABLE Record'),
        'GET',
        undefined,
        422,
      );
      const search = (
        await call(
          c,
          'sales?limit=1&filters=' +
            encodeURIComponent(JSON.stringify({ personId: 'مشتری آزمون' })),
        )
      ).data;
      assert.ok(search.totalCount >= 1);
      assert.equal(search.rows.length, 1);
      const filtered = (
        await call(
          c,
          'people?limit=2&filters=' + encodeURIComponent(JSON.stringify({ name: 'کیان' })),
        )
      ).data;
      assert.equal(filtered.rows[0].id, literal.id);
      const dates = (
        await call(
          c,
          'sales?limit=2&filters=' + encodeURIComponent(JSON.stringify({ date: '۱۴۰۵/۰۱' })),
        )
      ).data;
      assert.ok(dates.totalCount > 0);
    },
  );
  await t.test(
    'local payment simulator settles once and rejects reopening a cancelled payment',
    async () => {
      const before = (await call(c, 'subscription')).data.subscription.endsAt;
      const checkout = (await call(c, 'billing/checkout', 'POST', { planId: plans[0].id })).data;
      assert.equal(checkout.mode, 'local');
      assert.ok(checkout.url.startsWith('/test-payment?id='));
      await call(c, 'billing/local/' + checkout.paymentId);
      const responses = await Promise.all(
        [1, 2].map(() =>
          call(c, 'billing/local/' + checkout.paymentId, 'POST', { outcome: 'success' }),
        ),
      );
      assert.ok(responses.every((r) => r.data.ok));
      const after = (await call(c, 'subscription')).data.subscription.endsAt;
      assert.equal(
        new Date(after).getTime() - new Date(before).getTime(),
        plans[0].durationDays * 86400000,
      );
      const cancelled = (await call(c, 'billing/checkout', 'POST', { planId: plans[0].id })).data;
      await call(c, 'billing/local/' + cancelled.paymentId, 'POST', { outcome: 'cancel' });
      await call(c, 'billing/local/' + cancelled.paymentId, 'POST', { outcome: 'success' }, 409);
      assert.equal((await call(c, 'subscription')).data.subscription.endsAt, after);
    },
  );
  await t.test(
    'local email verification is one-use and mailbox is limited to the recipient',
    async () => {
      await call(c, 'auth/request-verification', 'POST', {});
      const inbox = (await call(c, 'local-mail')).data.rows;
      const mail = inbox.find((r: any) => r.kind === 'verify-email');
      assert.ok(mail);
      const token = new URL(mail.url).searchParams.get('token');
      await call(empty, 'auth/verify-email', 'POST', { token });
      assert.ok((await call(c, 'auth/me')).data.user.emailVerifiedAt);
      await call(empty, 'auth/verify-email', 'POST', { token }, 422);
      const unrelated = await call(empty, 'auth/register', 'POST', {
        email: 'inbox-' + slug + '@test.local',
        password: 'Local-inbox-private-password!',
        name: 'کاربر صندوق',
        organizationName: 'سازمان صندوق',
        slug: 'inbox-' + slug,
      });
      const own = (await call({ cookie: unrelated.cookie, scope: {} }, 'local-mail')).data.rows;
      assert.ok(own.every((r: any) => r.email === 'inbox-' + slug + '@test.local'));
    },
  );
  await t.test(
    'local provider scenarios distinguish success, rejection, retry and ambiguous delivery',
    async () => {
      await call(c, 'integrations/smsir', 'PATCH', { mode: 'local', enabled: true, config: {} });
      for (const [scenario, expected] of [
        ['success', 'LOCAL_SUCCESS'],
        ['reject', 'LOCAL_FAILED'],
        ['retry', 'LOCAL_SUCCESS'],
        ['timeout', 'REVIEW_REQUIRED'],
      ]) {
        const job = (
          await call(c, 'integrations/smsir', 'POST', {
            mobile: '09123456789',
            message: 'آزمایش محلی',
            scenario,
          })
        ).data;
        let current: any;
        for (let i = 0; i < 8; i++) {
          await db.integrationJob.updateMany({
            where: { id: job.id, status: 'RETRY' },
            data: { nextAttemptAt: new Date() },
          });
          await processJob();
          current = await db.integrationJob.findUniqueOrThrow({ where: { id: job.id } });
          if (current.status === expected) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.equal(current.status, expected);
        assert.equal(current.result.mode, 'local');
        if (scenario === 'reject') {
          await call(c, `integrations/${job.id}/retry`, 'POST', { scenario: 'success' });
          await processJob();
          assert.equal(
            (await db.integrationJob.findUniqueOrThrow({ where: { id: job.id } })).status,
            'LOCAL_SUCCESS',
          );
        }
      }
    },
  );
  await t.test('local laboratory is explicitly disabled in production', async () => {
    const { requireLocalMode } = await import('../src/local-mode');
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      assert.throws(() => requireLocalMode());
    } finally {
      if (previous === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
    }
  });
  await t.test(
    'local Modian simulation accepts only a posted invoice in the current company',
    async () => {
      await call(c, 'integrations/modian', 'PATCH', { mode: 'local', enabled: true, config: {} });
      const invoice = await db.record.findFirstOrThrow({
        where: {
          companyId: c.scope.companyId,
          module: 'sales',
          postedAt: { not: null },
          reversedAt: null,
        },
      });
      const job = (
        await call(c, 'integrations/modian', 'POST', { recordId: invoice.id, scenario: 'success' })
      ).data;
      await processJob();
      const result = await db.integrationJob.findUniqueOrThrow({ where: { id: job.id } });
      assert.equal(result.status, 'LOCAL_SUCCESS');
      await call(
        c,
        'integrations/modian',
        'POST',
        { recordId: created.people.id, scenario: 'success' },
        422,
      );
    },
  );
  await t.test('depreciation periods follow Persian months and reject overlaps', async () => {
    assert.equal(
      depreciationPeriod(new Date('2026-03-25'), 1).end,
      depreciationPeriod(new Date('2026-04-15'), 1).end,
    );
    assert.notEqual(
      depreciationPeriod(new Date('2026-04-15'), 1).end,
      depreciationPeriod(new Date('2026-04-25'), 1).end,
    );
    assert.throws(() => depreciationPeriod(new Date(date), 1.5));
    await call(
      c,
      'depreciation',
      'POST',
      { code: 'DUPLICATE-DEP', date, assetId: created.assets.id, months: 1, status: 'تأیید شده' },
      409,
    );
    await call(
      c,
      'depreciation',
      'POST',
      {
        code: 'OVERLAP-DEP',
        date: '2026-04-25',
        assetId: created.assets.id,
        months: 2,
        status: 'تأیید شده',
      },
      409,
    );
  });
  await t.test(
    'paged SQL listing stays bounded with 5000 records and concurrent searches',
    async () => {
      await db.record.createMany({
        data: Array.from({ length: 5000 }, (_, i) => ({
          organizationId: boot.scope.organizationId,
          companyId: c.scope.companyId,
          module: 'people',
          code: 'LOAD-' + String(i).padStart(5, '0'),
          name: 'مشتری سنجش ' + i,
          status: 'فعال',
          data: { notes: 'دادهٔ مجزای سنجش' },
        })),
      });
      const durations: number[] = [];
      let maxResponseBytes = 0;
      for (let batch = 0; batch < 2; batch++)
        await Promise.all(
          Array.from({ length: 10 }, async (_, i) => {
            const start = performance.now();
            const result = (
              await call(c, `people?limit=25&page=${i + 1}&q=${encodeURIComponent('مشتری سنجش')}`)
            ).data;
            durations.push(performance.now() - start);
            assert.equal(result.totalCount, 5000);
            assert.equal(result.rows.length, 25);
            maxResponseBytes = Math.max(
              maxResponseBytes,
              Buffer.byteLength(JSON.stringify(result)),
            );
          }),
        );
      durations.sort((a, b) => a - b);
      const p95 = durations[Math.ceil(durations.length * 0.95) - 1];
      assert.ok(p95 < 5000, `Concurrent list p95 exceeded 5 seconds: ${p95}`);
      assert.ok(maxResponseBytes < 100000);
      writeFileSync(
        path.resolve(__dirname, '../../artifacts/backend-review/load-report.json'),
        JSON.stringify(
          {
            records: 5000,
            concurrency: 10,
            requests: durations.length,
            pageSize: 25,
            p50Ms: Math.round(durations[9]),
            p95Ms: Math.round(p95),
            maxResponseBytes,
            generatedAt: new Date().toISOString(),
            scope:
              'Isolated database; list/search benchmark only, not a production capacity certification',
          },
          null,
          2,
        ),
      );
    },
  );
  writeFileSync(
    path.resolve(__dirname, '../../.runtime/browser-fixture.json'),
    JSON.stringify({
      cookie: c.cookie,
      platformCookie: platform.cookie,
      scope: c.scope,
      records: created,
    }),
  );
  await t.test(
    'year closure rejects drafts, closes temporary accounts and locks old dates',
    async () => {
      await call(c, 'period-close', 'POST', {}, 409);
      const drafts = await db.record.findMany({
        where: {
          companyId: c.scope.companyId,
          yearId: c.scope.yearId,
          postedAt: null,
          module: { notIn: ['quotes', 'checks'] },
          status: { not: 'لغو شده' },
        },
      });
      for (const r of drafts)
        await call(c, r.module + '/' + r.id, 'PATCH', { status: 'لغو شده', version: r.version });
      const profitBefore = (await call(c, 'reports/profit-loss')).data.summary;
      const close = (
        await call(c, 'period-close', 'POST', {
          nextEndDate: '2028-03-19',
          nextCode: '1406',
          nextName: 'سال ۱۴۰۶',
        })
      ).data;
      assert.ok(close.nextYearId);
      assert.deepEqual((await call(c, 'reports/profit-loss')).data.summary, profitBefore);
      await call(
        c,
        'expenses',
        'POST',
        { code: 'LATE', date, amount: '1', bankId: bank.id, currency: 'تومان', exchangeRate: '1' },
        422,
      );
      await call(c, 'fiscal-years/' + c.scope.yearId, 'PATCH', { status: 'باز', version: 2 }, 409);
      assert.equal((await call(c, 'reports/balance-sheet')).data.summary[3].value, '0.000000');
    },
  );
});
