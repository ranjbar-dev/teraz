import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { db, transaction, passwordHash, Principal, Scope } from './core';
import { createOrganization } from './provision';
import { RecordsService } from './records';
import { PayrollService, samplePayrollRules } from './payroll';
async function seed() {
  const slug = 'taraz-demo';
  if (await db.organization.findUnique({ where: { slug } })) {
    console.log('Demo organization already exists; its records were preserved.');
    return;
  }
  const password = randomBytes(18).toString('base64url'),
    email = 'demo@taraz.local';
  const setup = await transaction('seed:demo', async (tx) => {
    const user = await tx.user.create({
      data: { email, name: 'مدیر شرکت نمونه', passwordHash: await passwordHash(password) },
    });
    const plan = await tx.plan.findFirstOrThrow({
      where: { active: true },
      orderBy: { companyLimit: 'desc' },
    });
    const org = await createOrganization(tx, {
      name: 'گروه بازرگانی آوید',
      slug,
      ownerId: user.id,
      planId: plan.id,
      trialDays: 90,
    });
    return { user, org };
  });
  await writeFile(
    path.resolve(__dirname, '../../.runtime/demo-credentials.json'),
    JSON.stringify({ email, password, organization: setup.org.name }, null, 2),
    { mode: 0o600 },
  );
  const p: Principal = {
    userId: setup.user.id,
    name: setup.user.name,
    email,
    superAdmin: false,
    organizationId: setup.org.id,
    role: 'OWNER',
    companyIds: [],
    permissions: [],
    sessionId: '',
  };
  const company = await db.company.findFirstOrThrow({ where: { organizationId: setup.org.id } });
  const year = await db.record.findFirstOrThrow({
      where: { companyId: company.id, module: 'fiscal-years' },
    }),
    branch = await db.record.findFirstOrThrow({
      where: { companyId: company.id, module: 'branches' },
    });
  const s: Scope = {
    organizationId: setup.org.id,
    companyId: company.id,
    yearId: year.id,
    branchId: 'all',
  };
  const date = new Date().toISOString().slice(0, 10),
    service = new RecordsService();
  let i = 100;
  const create = async (key: string, values: any, status?: string) =>
    service.write(p, s, key, {
      code: 'AV-' + i++,
      date,
      ...values,
      ...(status ? { status } : {}),
    }) as Promise<any>;
  const person = await create('people', {
    name: 'شرکت سپهر ایرانیان',
    type: 'هر دو',
    phone: '02188001234',
    nationalId: '10100000000',
    economicCode: '10100000000',
    legalType: 'حقوقی',
    address: 'تهران، خیابان مطهری',
  });
  await create('people', { name: 'فروشگاه نیکان', type: 'مشتری', phone: '02144001234' });
  const product = await create('products', {
      name: 'صندلی اداری ارگونومیک',
      type: 'کالا',
      category: 'تجهیزات اداری',
      price: '2500000',
      cost: '1850000',
      minStock: '10',
      unit: 'عدد',
    }),
    finished = await create('products', {
      name: 'ست میز کار',
      type: 'کالا',
      category: 'محصول نهایی',
      price: '5000000',
      cost: '3700000',
      unit: 'عدد',
      minStock: '3',
    });
  await create('products', {
    name: 'خدمات نصب و راه‌اندازی',
    type: 'خدمت',
    category: 'خدمات',
    price: '1500000',
    cost: '0',
    unit: 'ساعت',
  });
  const warehouse = await create('warehouses', {
    name: 'انبار مرکزی تهران',
    address: 'تهران، شهرک صنعتی',
    manager: 'رضا احمدی',
  });
  const bank = await create('banks', {
      name: 'بانک ملت · حساب جاری',
      type: 'بانک',
      currency: 'تومان',
      exchangeRate: '1',
      openingBalance: '350000000',
    }),
    cash = await create('banks', {
      name: 'صندوق دفتر مرکزی',
      type: 'صندوق',
      currency: 'تومان',
      exchangeRate: '1',
      openingBalance: '10000000',
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
        title: product.name,
        quantity: '100',
        price: '1850000',
        discount: '0',
        tax: '10',
      },
    ],
  };
  const purchase = await create('purchases', invoice, 'تأیید شده');
  const sale = await create(
    'sales',
    { ...invoice, lines: [{ ...invoice.lines[0], quantity: '10', price: '2500000' }] },
    'تأیید شده',
  );
  await create('quotes', {
    ...invoice,
    lines: [{ ...invoice.lines[0], quantity: '20', price: '2500000' }],
  });
  await create(
    'receipts',
    {
      personId: person.id,
      bankId: bank.id,
      invoiceId: sale.id,
      amount: '10000000',
      currency: 'تومان',
      exchangeRate: '1',
    },
    'تأیید شده',
  );
  await create(
    'payments',
    {
      personId: person.id,
      bankId: bank.id,
      invoiceId: purchase.id,
      amount: '100000000',
      currency: 'تومان',
      exchangeRate: '1',
    },
    'تأیید شده',
  );
  await create(
    'sales-returns',
    {
      ...invoice,
      originalInvoiceId: sale.id,
      lines: [{ ...invoice.lines[0], quantity: '1', price: '2500000' }],
    },
    'تأیید شده',
  );
  await create(
    'purchase-returns',
    { ...invoice, originalInvoiceId: purchase.id, lines: [{ ...invoice.lines[0], quantity: '2' }] },
    'تأیید شده',
  );
  await create(
    'stock',
    {
      productId: product.id,
      warehouseId: warehouse.id,
      type: 'رسید',
      quantity: '5',
      unitCost: '1850000',
    },
    'تأیید شده',
  );
  await create(
    'transfers',
    { fromBankId: bank.id, toBankId: cash.id, amount: '5000000' },
    'تأیید شده',
  );
  await create('checks', {
    personId: person.id,
    type: 'دریافتی',
    amount: '8000000',
    currency: 'تومان',
    exchangeRate: '1',
    bankId: bank.id,
    dueDate: date,
  });
  await create(
    'expenses',
    {
      name: 'اجاره دفتر شهریور',
      amount: '18000000',
      bankId: bank.id,
      currency: 'تومان',
      exchangeRate: '1',
      category: 'اجاره',
    },
    'تأیید شده',
  );
  await create(
    'income',
    {
      name: 'درآمد خدمات مشاوره',
      amount: '12000000',
      bankId: bank.id,
      currency: 'تومان',
      exchangeRate: '1',
    },
    'تأیید شده',
  );
  const employee = await create('employees', {
    name: 'سارا رضایی',
    position: 'کارشناس مالی',
    department: 'حسابداری',
    salary: '24000000',
    startDate: (year.data as any).startDate,
  });
  await create('payroll', {
    employeeId: employee.id,
    base: '24000000',
    benefits: '4000000',
    days: 30,
    overtimeHours: 8,
    bankId: bank.id,
    month: 'شهریور',
  });
  await new PayrollService().save(p, s, {
    name: 'نمونهٔ قواعد ۱۴۰۵ — نیازمند تأیید',
    from: (year.data as any).startDate,
    to: (year.data as any).endDate,
    rules: samplePayrollRules,
    source: 'نمونه برای تست؛ قبل از تأیید با بخشنامهٔ رسمی تطبیق دهید.',
    verified: false,
  });
  const asset = await create('assets', {
    name: 'تجهیزات رایانه‌ای دفتر',
    category: 'تجهیزات',
    cost: '60000000',
    salvage: '6000000',
    life: '36',
    location: 'دفتر مرکزی',
  });
  await create('depreciation', { assetId: asset.id, months: '1' }, 'تأیید شده');
  const bom = await create('boms', {
    name: 'ست میز کار دو نفره',
    productId: finished.id,
    lines: [
      {
        productId: product.id,
        title: product.name,
        quantity: '2',
        price: '0',
        discount: '0',
        tax: '0',
      },
    ],
  });
  await create(
    'production',
    { bomId: bom.id, warehouseId: warehouse.id, quantity: '3', overhead: '600000' },
    'تکمیل شده',
  );
  const project = await create(
    'projects',
    {
      name: 'تجهیز دفتر شرکت سپهر',
      personId: person.id,
      manager: 'علی کریمی',
      dueDate: date,
      budget: '180000000',
      progress: '35',
    },
    'در حال اجرا',
  );
  await create(
    'project-costs',
    {
      projectId: project.id,
      name: 'حمل تجهیزات پروژه',
      type: 'هزینه',
      amount: '2800000',
      bankId: bank.id,
    },
    'تأیید شده',
  );
  const account = await create('accounts', {
    name: 'هزینه ملزومات اداری',
    type: 'هزینه',
    level: 'معین',
  });
  const equity = await db.record.findFirstOrThrow({
    where: { companyId: company.id, module: 'accounts', code: '3100' },
  });
  await create(
    'journals',
    {
      name: 'ثبت هزینه پرداخت‌شده توسط شریک',
      lines: [
        { accountId: account.id, title: 'هزینه ملزومات', debit: '850000', credit: '0' },
        { accountId: equity.id, title: 'آورده شریک', debit: '0', credit: '850000' },
      ],
    },
    'تأیید شده',
  );
  await create('branches', { name: 'شعبه اصفهان', phone: '03133001234' });
  await create('companies', { name: 'آوید خدمات', baseCurrency: 'IRT' });
  await create('users', {
    name: 'کارشناس حسابداری نمونه',
    email: 'accountant-demo@taraz.local',
    password: randomBytes(24).toString('base64url'),
    role: 'حسابدار',
  });
  console.log('Real demo transactions created. Login details: .runtime/demo-credentials.json');
}
seed()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e.message);
    await db.$disconnect();
    process.exit(1);
  });
