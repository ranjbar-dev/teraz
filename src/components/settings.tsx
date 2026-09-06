'use client';
import { SearchSelect } from './search-select';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Save, Check, ArrowUpLeft, Info, BookOpen, Search } from 'lucide-react';
import { useApp } from './provider';
import { PageHeading } from './ui';
import { Icon } from './icons';
import { DataTable } from './data-table';
import { useRows } from './modules';
export function Settings() {
  const { boot, api, notify, reload, setUnsaved } = useApp();
  const [values, setValues] = useState<Record<string, string | number>>({});
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('general');
  useEffect(() => {
    if (boot) setValues(boot.settings);
  }, [boot]);
  useEffect(() => {
    setUnsaved(
      !!Object.keys(values).length && JSON.stringify(values) !== JSON.stringify(boot?.settings),
    );
    return () => setUnsaved(false);
  }, [values, boot, setUnsaved]);
  if (boot?.user.role !== 'مدیر')
    return <div className="empty-state">تنظیمات فقط برای مدیر در دسترس است.</div>;
  const set = (key: string, value: string | number) => setValues((v) => ({ ...v, [key]: value }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('settings', { method: 'PATCH', body: JSON.stringify(values) });
      setUnsaved(false);
      await reload();
      notify('تنظیمات شرکت ذخیره شد.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeading
        eyebrow="فضای کاری، به شیوهٔ شما"
        title="تنظیمات"
        description="تنظیمات نمایش، فاکتورها و اطلاعات کسب‌وکارتان را شخصی‌سازی کنید."
      />
      <div className="settings-layout">
        <nav className="settings-nav">
          {[
            { key: 'general', label: 'عمومی و نمایش', icon: 'building' },
            { key: 'invoice', label: 'فاکتور و مالیات', icon: 'receipt' },
            { key: 'workspace', label: 'فضای کاری', icon: 'shield' },
          ].map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? 'selected' : ''}
              onClick={() => setTab(t.key)}
            >
              <Icon name={t.icon} size={19} />
              {t.label}
            </button>
          ))}
        </nav>
        <form className="panel form-panel settings-panel" onSubmit={save}>
          <h2>
            {tab === 'general'
              ? 'تنظیمات عمومی'
              : tab === 'invoice'
                ? 'پیش‌فرض‌های فاکتور'
                : 'مدیریت فضای کاری'}
          </h2>
          <p className="muted">این تنظیمات فقط روی شرکت انتخاب‌شده اعمال می‌شود.</p>
          {tab === 'general' && (
            <div className="form-grid">
              <label className="field">
                <span>ارز مبنای دفاتر</span>
                <input className="input" readOnly value={values.currency || 'تومان'} />
                <small className="field-help">
                  ارز مبنا در مشخصات شرکت تعیین می‌شود و پس از ثبت سند قطعی تغییر نمی‌کند.
                </small>
              </label>
              <label className="field">
                <span>تقویم</span>
                <SearchSelect
                  className="input"
                  value={values.calendar || 'شمسی'}
                  onChange={(e) => set('calendar', e.target.value)}
                >
                  <option>شمسی</option>
                  <option>میلادی</option>
                </SearchSelect>
              </label>
              <label className="field">
                <span>نمایش اعداد</span>
                <SearchSelect
                  className="input"
                  value={values.digits || 'فارسی'}
                  onChange={(e) => set('digits', e.target.value)}
                >
                  <option>فارسی</option>
                  <option>لاتین</option>
                </SearchSelect>
              </label>
              <label className="field">
                <span>تلفن</span>
                <input
                  className="input"
                  value={values.phone || ''}
                  onChange={(e) => set('phone', e.target.value)}
                />
              </label>
              <label className="field field-full">
                <span>نشانی</span>
                <textarea
                  className="input"
                  value={values.address || ''}
                  onChange={(e) => set('address', e.target.value)}
                  rows={3}
                />
              </label>
              <div className="theme-preview field-full">
                <span className="theme-swatch" />
                <div>
                  <strong>روشن، آرام، خوانا</strong>
                  <p>تم روشن تراز · رنگ سبز · قلم وزیرمتن</p>
                </div>
                <Check size={21} />
              </div>
            </div>
          )}
          {tab === 'invoice' && (
            <div className="form-grid">
              <label className="field">
                <span>نرخ پیش‌فرض مالیات (%)</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="input"
                  value={values.taxRate ?? 10}
                  onChange={(e) => set('taxRate', e.target.value)}
                />
                <small className="field-help">نرخ آزمایشی است و برای هر ردیف قابل تغییر است.</small>
              </label>
              <label className="field">
                <span>پیشوند شماره فاکتور</span>
                <input
                  className="input"
                  value={values.invoicePrefix || 'TR'}
                  onChange={(e) => set('invoicePrefix', e.target.value)}
                />
              </label>
              <label className="field">
                <span>مهلت پرداخت (روز)</span>
                <input
                  type="number"
                  min="0"
                  max="365"
                  className="input"
                  value={values.paymentTerms ?? 30}
                  onChange={(e) => set('paymentTerms', e.target.value)}
                />
              </label>
              <label className="field field-full">
                <span>یادداشت پایین فاکتور</span>
                <textarea
                  className="input"
                  rows={4}
                  value={values.invoiceNote || ''}
                  onChange={(e) => set('invoiceNote', e.target.value)}
                />
              </label>
              <div className="form-note field-full">
                <Info size={18} />
                <p>
                  تغییر نرخ مالیات، اطلاعات اسناد قبلی را تغییر نمی‌دهد. نرخ هر سند در زمان ثبت
                  نگهداری می‌شود.
                </p>
              </div>
            </div>
          )}
          {tab === 'workspace' && (
            <div className="workspace-settings">
              <div className="form-note">
                <Icon name="shield" size={22} />
                <p>اطلاعات در PostgreSQL ذخیره می‌شوند. هر سازمان، شرکت‌ها و اعضای مستقل دارد.</p>
              </div>
              {[
                { key: 'companies', name: 'شرکت‌ها و اطلاعات ثبتی' },
                { key: 'branches', name: 'شعبه‌ها' },
                { key: 'fiscal-years', name: 'سال‌های مالی و بستن دوره' },
                { key: 'currencies', name: 'ارزها و نرخ‌های آزمایشی' },
                { key: 'users', name: 'کاربران و سطح دسترسی' },
                { key: 'activity', name: 'تاریخچه فعالیت‌ها' },
              ].map((l) => (
                <Link key={l.key} href={`/${l.key}`}>
                  {l.name}
                  <ArrowUpLeft size={17} />
                </Link>
              ))}
            </div>
          )}
          {tab !== 'workspace' && (
            <div className="settings-save">
              <button className="btn btn-primary" disabled={busy}>
                <Save size={17} />
                {busy ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
              </button>
            </div>
          )}
        </form>
      </div>
    </>
  );
}
export function Activity() {
  const { rows, error } = useRows('activity');
  return (
    <>
      <PageHeading
        eyebrow="شفافیت در هر ثبت"
        title="تاریخچه فعالیت‌ها"
        description="ثبت و ویرایش اطلاعات، همراه با نام کاربر و زمان انجام عملیات."
      />
      {error ? (
        <p>{error}</p>
      ) : (
        <div className="panel">
          <DataTable
            title="تاریخچه فعالیت‌ها"
            rows={rows || []}
            columns={[
              { key: 'message', label: 'فعالیت' },
              { key: 'user', label: 'کاربر' },
              { key: 'date', label: 'تاریخ', type: 'date' },
              {
                key: 'time',
                label: 'ساعت',
                text: (r) =>
                  new Date(String(r.date)).toLocaleTimeString('fa-IR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
              },
            ]}
          />
        </div>
      )}
    </>
  );
}
const helpItems = [
  [
    'چطور شروع کنم؟',
    'سازمان را ثبت‌نام کنید یا با حسابی که مدیر کل ساخته وارد شوید. شرکت، شعبه و سال مالی را انتخاب کنید. ابتدا اشخاص، کالاها، انبار و حساب بانکی را تعریف و سپس خرید و فروش ثبت کنید.',
  ],
  [
    'چه چیزی روی گزارش‌ها اثر می‌گذارد؟',
    'ثبت قطعی فاکتور و تراکنش، دفتر حسابداری را به‌روزرسانی می‌کند. چک ابتدا در حساب اسناد ثبت و با وصول به بانک منتقل می‌شود. سند قطعی ویرایش یا حذف نمی‌شود؛ برای اصلاح از «ثبت سند برگشتی» با تاریخ و دلیل استفاده کنید.',
  ],
  [
    'چطور یک فاکتور را تسویه کنم؟',
    'در دریافت‌ها برای فروش یا پرداخت‌ها برای خرید، طرف حساب و فاکتور مرتبط را انتخاب کنید. ارز و طرف حساب باید یکسان باشند. با تأیید، تخصیص پرداخت و ماندهٔ فاکتور ثبت می‌شود. پرداخت بیش از مانده پذیرفته نمی‌شود.',
  ],
  [
    'جست‌وجوی جدول‌ها چگونه است؟',
    'جست‌وجوی عمومی تمام فیلدها را بررسی می‌کند. زیر عنوان هر ستون نیز فیلتر مستقل دارید. با دکمه ستون‌ها، فیلدهای دیگر را نمایش دهید. کلیک روی عنوان ستون، مرتب‌سازی را تغییر می‌دهد.',
  ],
  [
    'خروجی Excel و چاپ چطور کار می‌کند؟',
    'خروجی اکسل، تمام ردیف‌های فیلترشده یا ردیف‌های انتخاب‌شده را در فایل xlsx ذخیره می‌کند. در جزئیات اسناد یا صفحه گزارش، چاپ را بزنید و برای PDF از گزینه Save as PDF مرورگر استفاده کنید.',
  ],
  [
    'نرخ ارز و مالیات واقعی هستند؟',
    'نرخ‌های اولیهٔ ارز نمونه‌اند؛ پیش از ثبت بررسی کنید. نرخ تبدیل هر سند حفظ می‌شود و دفاتر با ارز مبنای شرکت گزارش می‌شوند. حقوق از نسخهٔ تاریخ‌دار قواعد محاسبه می‌شود و ثبت قطعی آن به تأیید قواعد توسط مدیر نیاز دارد.',
  ],
  [
    'تولید و استهلاک چگونه آزمایش می‌شوند؟',
    'در فرمول ساخت، مواد لازم برای یک محصول را وارد کنید. تکمیل سفارش تولید، مواد را از انبار کم و محصول را اضافه می‌کند. استهلاک با روش خط مستقیم از بهای دارایی، ارزش اسقاط و عمر مفید محاسبه می‌شود.',
  ],
  [
    'تفاوت نقش‌های کاربری چیست؟',
    'مدیر تمام بخش‌ها را مدیریت می‌کند. حسابدار اطلاعات مالی و عملیاتی را ثبت و ویرایش می‌کند. مشاهده‌گر به فهرست‌ها، جزئیات، گزارش‌ها و خروجی دسترسی دارد و نمی‌تواند داده‌ها را تغییر دهد.',
  ],
  [
    'داده‌ها کجا ذخیره می‌شوند؟',
    'در PostgreSQL محلی و از طریق سرویس NestJS. داده‌ها پس از خاموش و روشن شدن باقی می‌مانند. فایل‌های پیوست خصوصی‌اند و دریافت آن‌ها به دسترسی همان سازمان نیاز دارد. اجرای محلی از Docker استفاده نمی‌کند.',
  ],
];
export function Help() {
  const [q, setQ] = useState('');
  return (
    <>
      <PageHeading
        eyebrow="همراه شما در تراز"
        title="راهنما و شروع سریع"
        description="هر چیزی که برای اولین ثبت و آزمایش امکانات نیاز دارید."
      />
      <div className="help-hero">
        <BookOpen size={32} />
        <h2>حسابداری، یک قدم ساده‌تر.</h2>
        <div className="table-search">
          <Search size={18} />
          <input
            aria-label="جست‌وجو در راهنما"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="دنبال چه چیزی هستید؟"
          />
        </div>
      </div>
      <div className="help-list">
        {helpItems
          .filter((item) => item.join(' ').includes(q))
          .map(([question, answer]) => (
            <details className="panel" key={question}>
              <summary>
                {question}
                <PlusFallback />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
      </div>
    </>
  );
}
function PlusFallback() {
  return <span className="help-plus">+</span>;
}
