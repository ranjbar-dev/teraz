import { randomUUID, scryptSync } from 'node:crypto';
import { modules } from './modules';
import type { Database, Line, Row } from './types';

export function hashPassword(password: string) {
  const salt = randomUUID();
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
export function seed(): Database {
  const db: Database = {
    version: 1,
    collections: Object.fromEntries(modules.map((m) => [m.key, []])),
    settings: {},
    sessions: {},
    audit: [],
  };
  const add = (
    key: string,
    company: string,
    id: string,
    values: Record<string, unknown> = {},
  ): Row => {
    const r = {
      id: `${company}-${id}`,
      companyId: company,
      branchId: `${company}-branch-1`,
      yearId: `${company}-year-1405`,
      createdAt: '2026-09-06T08:00:00Z',
      status: 'فعال',
      ...values,
    } as Row;
    db.collections[key].push(r);
    return r;
  };
  for (const [ci, company] of ['c1', 'c2'].entries()) {
    add('companies', company, 'company', {
      id: company,
      code: `00${ci + 1}`,
      name: ci ? 'گروه خدماتی سپهر' : 'شرکت بازرگانی آوید',
      nationalId: ci ? '۱۰۳۲۰۸۹۴۵۶۱' : '۱۰۱۰۳۹۸۴۷۲۱',
      registration: '۴۸۲۱۰',
      phone: '۰۲۱–۸۸۵۴۳۰۰۰',
      address: 'تهران، خیابان ولیعصر، ساختمان آوید، طبقه سوم',
    });
    add('branches', company, 'branch-1', {
      code: '01',
      name: 'دفتر مرکزی',
      manager: 'آرمان رضایی',
      phone: '۰۲۱۸۸۵۴۳۰۰۰',
      address: 'تهران، خیابان ولیعصر',
    });
    add('branches', company, 'branch-2', {
      code: '02',
      name: 'شعبه اصفهان',
      manager: 'سارا محمدی',
      phone: '۰۳۱۳۶۶۴۲۱۱۰',
      address: 'اصفهان، خیابان چهارباغ',
    });
    add('fiscal-years', company, 'year-1405', {
      name: 'سال مالی ۱۴۰۵',
      startDate: '2026-03-21',
      endDate: '2027-03-20',
      status: 'باز',
    });
    add('fiscal-years', company, 'year-1404', {
      name: 'سال مالی ۱۴۰۴',
      startDate: '2025-03-21',
      endDate: '2026-03-20',
      status: 'بسته',
    });
    db.settings[company] = {
      currency: 'تومان',
      taxRate: 10,
      invoicePrefix: 'AV',
      paymentTerms: 30,
      address: 'تهران، خیابان ولیعصر',
      phone: '۰۲۱۸۸۵۴۳۰۰۰',
      invoiceNote: 'از اعتماد و همراهی شما سپاسگزاریم.',
      calendar: 'شمسی',
      digits: 'فارسی',
      lowStock: 1,
    };
    ['تومان', 'ریال', 'دلار', 'یورو', 'درهم'].forEach((name, i) =>
      add('currencies', company, `currency-${i}`, {
        name,
        rate: [1, 0.1, 95000, 104000, 26000][i],
        date: '2026-09-06',
      }),
    );
    [
      'شرکت نوآوران فردا',
      'گروه مهندسی مانا',
      'علی محمدی',
      'فروشگاه خانه سبز',
      'شرکت تجهیز گستر',
      'استودیو طراحی نقطه',
      'مریم احمدی',
      'پخش سراسری پارسا',
      'شرکت توسعه رایان',
      'صنایع آذرخش',
      'نگین تجارت',
      'آرش کریمی',
      'مؤسسه آفرینش',
      'فناوران سپید',
    ].forEach((name, i) =>
      add('people', company, `person-${i}`, {
        code: `P-${1001 + i}`,
        name,
        type: i % 3 === 0 ? 'تأمین‌کننده' : 'مشتری',
        phone: `0912${String(3481020 + i)}`,
        email: `contact${i + 1}@example.com`,
        nationalId: `10320${12345 + i}`,
        creditLimit: 250000000,
        address: i % 2 ? 'تهران، خیابان مطهری' : 'اصفهان، خیابان چهارباغ',
        notes: 'طرف حساب آزمایشی',
      }),
    );
    const products = [
      ['صندلی ارگونومیک آریا', 8500000, 6100000, 'تجهیزات اداری'],
      ['میز کار مینیمال', 12400000, 8900000, 'تجهیزات اداری'],
      ['مانیتور ۲۷ اینچ', 18200000, 13700000, 'لوازم دیجیتال'],
      ['چراغ مطالعه مدل نور', 1650000, 980000, 'تجهیزات اداری'],
      ['کیبورد بی‌سیم', 2400000, 1600000, 'لوازم دیجیتال'],
      ['مشاوره و پشتیبانی', 1500000, 600000, 'خدمات'],
      ['چوب MDF', 850000, 650000, 'مواد اولیه'],
      ['پایه فلزی میز', 1200000, 800000, 'مواد اولیه'],
      ['میز تولیدی مدل سرو', 6500000, 4200000, 'محصول نهایی'],
    ];
    products.forEach(([name, price, cost, category], i) =>
      add('products', company, `product-${i}`, {
        code: `PR-${100 + i}`,
        name,
        price,
        cost,
        category,
        type: i === 5 ? 'خدمت' : 'کالا',
        unit: i === 5 ? 'ساعت' : 'عدد',
        minStock: i === 3 ? 15 : 5,
      }),
    );
    add('warehouses', company, 'warehouse-1', {
      code: 'W-01',
      name: 'انبار مرکزی',
      manager: 'امیر حسینی',
      phone: '۰۹۱۲۴۳۵۶۷۸۹',
      address: 'تهران، شهرک صنعتی شمس‌آباد',
    });
    add('warehouses', company, 'warehouse-2', {
      code: 'W-02',
      name: 'انبار فروشگاه',
      manager: 'نگار نوری',
      address: 'اصفهان، شعبه اصفهان',
      branchId: `${company}-branch-2`,
    });
    products.forEach((_, i) => {
      if (i !== 5)
        add('stock', company, `stock-${i}`, {
          code: `ST-${100 + i}`,
          date: '2026-03-21',
          productId: `${company}-product-${i}`,
          warehouseId: `${company}-warehouse-1`,
          type: 'رسید',
          quantity: i === 3 ? 21 : 200,
          status: 'تأیید شده',
          notes: 'موجودی ابتدای دوره',
        });
    });
    products.forEach((_, i) => {
      if (i !== 5)
        add('stock', company, `branch-stock-${i}`, {
          code: `ST-B-${100 + i}`,
          date: '2026-03-21',
          productId: `${company}-product-${i}`,
          warehouseId: `${company}-warehouse-2`,
          branchId: `${company}-branch-2`,
          type: 'رسید',
          quantity: 40,
          status: 'تأیید شده',
          notes: 'موجودی ابتدای دوره شعبه',
        });
    });
    add('banks', company, 'bank-1', {
      code: 'B-01',
      name: 'بانک سامان',
      type: 'بانک',
      currency: 'تومان',
      openingBalance: 860000000,
      accountNumber: '۸۲۱–۴۰–۱۰۲۳۴۵۶–۱',
      iban: 'IR240560082104010234560001',
    });
    add('banks', company, 'bank-2', {
      code: 'B-02',
      name: 'بانک ملت',
      type: 'بانک',
      currency: 'تومان',
      openingBalance: 420000000,
      accountNumber: '۵۴۰۲۱۰۸۳۴',
      iban: 'IR160120000000005402108340',
    });
    add('banks', company, 'bank-3', {
      code: 'C-01',
      name: 'صندوق دفتر مرکزی',
      type: 'صندوق',
      currency: 'تومان',
      openingBalance: 45000000,
    });
    const accounts = [
      ['1101', 'وجوه نقد و بانک', 'دارایی'],
      ['1201', 'حساب‌های دریافتنی', 'دارایی'],
      ['1202', 'اعتبار مالیات خرید', 'دارایی'],
      ['1301', 'موجودی کالا', 'دارایی'],
      ['1501', 'دارایی‌های ثابت', 'دارایی'],
      ['1502', 'استهلاک انباشته', 'دارایی'],
      ['2101', 'حساب‌های پرداختنی', 'بدهی'],
      ['2102', 'مالیات فروش پرداختنی', 'بدهی'],
      ['2103', 'بیمه و کسورات پرداختنی', 'بدهی'],
      ['2104', 'حقوق پرداختنی', 'بدهی'],
      ['3101', 'سرمایه و مانده افتتاحیه', 'سرمایه'],
      ['4101', 'درآمد فروش', 'درآمد'],
      ['4102', 'سایر درآمدها', 'درآمد'],
      ['5101', 'بهای تمام‌شده فروش', 'هزینه'],
      ['5102', 'هزینه‌های عملیاتی', 'هزینه'],
      ['5103', 'هزینه حقوق و دستمزد', 'هزینه'],
      ['5104', 'هزینه استهلاک', 'هزینه'],
    ];
    accounts.forEach(([code, name, type]) =>
      add('accounts', company, `account-${code}`, {
        code,
        name,
        type,
        level: 'معین',
        system: true,
      }),
    );
    for (let i = 0; i < 30; i++) {
      const month = 4 + Math.floor(i / 6),
        day = 2 + (i % 6) * 4,
        product = i % 5,
        qty = (i % 4) + 1;
      const line: Line = {
        id: randomUUID(),
        productId: `${company}-product-${product}`,
        title: String(products[product][0]),
        quantity: qty + ci,
        price: Number(products[product][1]),
        discount: i % 3 === 0 ? 5 : 0,
        tax: 10,
        debit: 0,
        credit: 0,
      };
      add('sales', company, `sale-${i}`, {
        code: `AV-${1041 + i}`,
        personId: `${company}-person-${i % 14}`,
        date: `2026-0${month}-${String(day).padStart(2, '0')}`,
        dueDate: `2026-0${Math.min(9, month + 1)}-${String(day).padStart(2, '0')}`,
        currency: 'تومان',
        exchangeRate: 1,
        warehouseId: `${company}-warehouse-${i % 7 === 0 ? 2 : 1}`,
        discount: 0,
        lines: [line],
        status: i === 28 ? 'پیش‌نویس' : 'تأیید شده',
        notes: 'فروش تجهیزات و ملزومات اداری',
        branchId: `${company}-branch-${i % 7 === 0 ? 2 : 1}`,
      });
      if (i % 3 !== 0)
        add('receipts', company, `receipt-${i}`, {
          code: `RC-${1030 + i}`,
          personId: `${company}-person-${i % 14}`,
          date: `2026-0${month}-${String(day + 2).padStart(2, '0')}`,
          amount: Math.round(qty * Number(products[product][1]) * 0.7),
          currency: 'تومان',
          exchangeRate: 1,
          bankId: `${company}-bank-1`,
          invoiceId: `${company}-sale-${i}`,
          method: 'انتقال بانکی',
          status: 'تأیید شده',
          branchId: `${company}-branch-${i % 7 === 0 ? 2 : 1}`,
        });
      if (i % 3 === 0)
        add('expenses', company, `expense-${i}`, {
          code: `EX-${100 + i}`,
          name: ['اجاره دفتر مرکزی', 'حمل و نقل سفارش‌ها', 'تبلیغات و بازاریابی'][i % 3],
          date: `2026-0${month}-${String(day).padStart(2, '0')}`,
          category: i % 2 ? 'تبلیغات' : 'اجاره',
          amount: 2400000 + i * 160000,
          currency: 'تومان',
          exchangeRate: 1,
          bankId: `${company}-bank-2`,
          status: 'تأیید شده',
        });
    }
    for (let i = 0; i < 7; i++) {
      const lines: Line[] = [
        {
          id: randomUUID(),
          productId: `${company}-product-${i % 5}`,
          title: String(products[i % 5][0]),
          quantity: 6 + i,
          price: Number(products[i % 5][2]),
          discount: 0,
          tax: 10,
          debit: 0,
          credit: 0,
        },
      ];
      add('purchases', company, `purchase-${i}`, {
        code: `PU-${101 + i}`,
        personId: `${company}-person-${i % 2 ? 3 : 0}`,
        date: `2026-0${4 + (i % 5)}-12`,
        dueDate: '2026-09-15',
        currency: 'تومان',
        exchangeRate: 1,
        warehouseId: `${company}-warehouse-1`,
        lines,
        discount: 0,
        status: 'تأیید شده',
      });
    }
    const sale = db.collections.sales.find((r) => r.companyId === company)!;
    add('quotes', company, 'quote-1', {
      ...sale,
      id: `${company}-quote-1`,
      code: 'PF-1082',
      date: '2026-09-05',
      dueDate: '2026-09-20',
      status: 'پیش‌نویس',
    });
    add('sales-returns', company, 'return-1', {
      ...sale,
      id: `${company}-return-1`,
      code: 'SR-101',
      lines: [{ ...(sale.lines as Line[])[0], quantity: 1 }],
      status: 'پیش‌نویس',
    });
    add('purchase-returns', company, 'return-2', {
      ...db.collections.purchases.find((r) => r.companyId === company)!,
      id: `${company}-return-2`,
      code: 'PR-101',
      status: 'پیش‌نویس',
    });
    add('payments', company, 'payment-1', {
      code: 'PY-201',
      personId: `${company}-person-0`,
      date: '2026-08-24',
      amount: 25000000,
      currency: 'تومان',
      exchangeRate: 1,
      bankId: `${company}-bank-1`,
      method: 'انتقال بانکی',
      status: 'تأیید شده',
    });
    add('transfers', company, 'transfer-1', {
      code: 'TR-101',
      date: '2026-08-29',
      fromBankId: `${company}-bank-1`,
      toBankId: `${company}-bank-3`,
      amount: 12000000,
      status: 'تأیید شده',
    });
    for (let i = 0; i < 5; i++)
      add('checks', company, `check-${i}`, {
        code: `۷۴۰۲۸${i}`,
        personId: `${company}-person-${i}`,
        type: i % 2 ? 'پرداختی' : 'دریافتی',
        date: '2026-08-10',
        dueDate: `2026-09-${String(7 + i * 3).padStart(2, '0')}`,
        amount: 25000000 + i * 10000000,
        currency: 'تومان',
        exchangeRate: 1,
        bankId: `${company}-bank-1`,
        sayad: `170024567891230${i}`,
        status: i === 4 ? 'وصول شده' : 'در جریان',
      });
    add('income', company, 'income-1', {
      code: 'IN-101',
      name: 'درآمد خدمات پشتیبانی',
      date: '2026-08-28',
      amount: 18500000,
      currency: 'تومان',
      exchangeRate: 1,
      bankId: `${company}-bank-1`,
      status: 'تأیید شده',
    });
    ['آرمان رضایی', 'سارا محمدی', 'امیر حسینی', 'نگار نوری', 'کیان شریفی'].forEach((name, i) => {
      add('employees', company, `employee-${i}`, {
        code: `HR-${100 + i}`,
        name,
        nationalId: `008123456${i}`,
        position: ['مدیر مالی', 'حسابدار', 'مسئول انبار', 'کارشناس فروش', 'پشتیبانی'][i],
        department: i < 2 ? 'مالی' : 'عملیات',
        startDate: '2025-04-05',
        salary: 38000000 - i * 3000000,
        phone: `0912345678${i}`,
        iban: `IR54057000001800234567000${i}`,
      });
      add('payroll', company, `payroll-${i}`, {
        code: `SL-140506-${i + 1}`,
        employeeId: `${company}-employee-${i}`,
        date: '2026-08-31',
        month: 'شهریور',
        base: 38000000 - i * 3000000,
        benefits: 4500000,
        insurance: 2500000,
        tax: 1000000,
        deductions: 0,
        bankId: `${company}-bank-1`,
        status: i < 2 ? 'پرداخت شده' : 'پیش‌نویس',
      });
    });
    ['خودروی حمل کالا', 'تجهیزات دفتر مرکزی', 'سرور حسابداری'].forEach((name, i) =>
      add('assets', company, `asset-${i}`, {
        code: `FA-${101 + i}`,
        name,
        date: '2026-03-21',
        category: i === 0 ? 'خودرو' : 'تجهیزات',
        cost: [950000000, 180000000, 125000000][i],
        salvage: [100000000, 10000000, 5000000][i],
        life: 60,
        location: 'دفتر مرکزی',
      }),
    );
    add('depreciation', company, 'dep-1', {
      code: 'DP-101',
      assetId: `${company}-asset-1`,
      date: '2026-08-31',
      months: 1,
      status: 'تأیید شده',
    });
    add('boms', company, 'bom-1', {
      code: 'BOM-101',
      name: 'فرمول میز سرو',
      productId: `${company}-product-8`,
      lines: [6, 7].map((i) => ({
        id: randomUUID(),
        productId: `${company}-product-${i}`,
        title: String(products[i][0]),
        quantity: i === 6 ? 2 : 4,
        price: Number(products[i][2]),
        discount: 0,
        tax: 0,
        debit: 0,
        credit: 0,
      })),
    });
    add('production', company, 'production-1', {
      code: 'MO-101',
      bomId: `${company}-bom-1`,
      date: '2026-08-25',
      warehouseId: `${company}-warehouse-1`,
      quantity: 5,
      overhead: 2000000,
      status: 'تکمیل شده',
    });
    ['تجهیز دفتر نوآوران', 'راه‌اندازی شعبه غرب', 'پشتیبانی سالانه مانا'].forEach((name, i) =>
      add('projects', company, `project-${i}`, {
        code: `PJ-${101 + i}`,
        name,
        personId: `${company}-person-${i}`,
        manager: 'آرمان رضایی',
        date: '2026-06-01',
        dueDate: '2026-11-20',
        budget: 200000000 + i * 80000000,
        progress: [72, 35, 90][i],
        status: 'در حال اجرا',
      }),
    );
    ['هزینه', 'درآمد'].forEach((type, i) =>
      add('project-costs', company, `pc-${i}`, {
        code: `PC-${101 + i}`,
        projectId: `${company}-project-0`,
        name: i ? 'دریافت مرحله اول قرارداد' : 'خرید تجهیزات پروژه',
        date: '2026-08-20',
        type,
        amount: i ? 125000000 : 78000000,
        bankId: `${company}-bank-1`,
        status: 'تأیید شده',
      }),
    );
    add('journals', company, 'journal-1', {
      code: 'JV-101',
      date: '2026-08-30',
      name: 'ثبت هزینه تعهدشده خدمات',
      status: 'تأیید شده',
      lines: [
        {
          id: randomUUID(),
          accountId: `${company}-account-5102`,
          title: 'هزینه خدمات',
          debit: 2500000,
          credit: 0,
          quantity: 0,
          price: 0,
          discount: 0,
          tax: 0,
        },
        {
          id: randomUUID(),
          accountId: `${company}-account-2101`,
          title: 'بستانکاران',
          debit: 0,
          credit: 2500000,
          quantity: 0,
          price: 0,
          discount: 0,
          tax: 0,
        },
      ],
    });
  }
  for (const [i, role] of ['مدیر', 'حسابدار', 'مشاهده‌گر'].entries())
    add('users', 'c1', `user-${i}`, {
      name: ['آرمان رضایی', 'سارا محمدی', 'کیان شریفی'][i],
      email: ['admin@taraz.app', 'accountant@taraz.app', 'viewer@taraz.app'][i],
      role,
      passwordHash: hashPassword('Taraz1405!'),
    });
  db.audit.push({
    id: randomUUID(),
    message: 'فضای کاری تراز آماده شد',
    user: 'سیستم',
    date: '2026-09-06T08:00:00Z',
    companyId: 'c1',
  });
  return db;
}
