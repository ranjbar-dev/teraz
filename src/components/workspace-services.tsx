'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  ShieldCheck,
  RefreshCw,
  Check,
  ArrowUpLeft,
  Download,
  Paperclip,
  Trash2,
} from 'lucide-react';
import { useApp } from './provider';
import { PageHeading, Confirm } from './ui';
import { Input, SmartTable, Item, format, day, stateLabel } from './saas-shared';
const titles: Item = {
  subscription: 'اشتراک سازمان',
  profile: 'حساب و سازمان‌ها',
  integrations: 'اتصال‌های بیرونی',
  'payroll-rules': 'قواعد حقوق و دستمزد',
  'period-close': 'عملیات پایان سال',
};
export function WorkspaceServices({ section }: { section: string }) {
  const { api, boot, notify, reload } = useApp();
  const [data, setData] = useState<Item | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<Item>({}),
    [creating, setCreating] = useState(false),
    [confirm, setConfirm] = useState(false);
  const endpoint = section === 'profile' ? 'auth/me' : section;
  async function refresh() {
    try {
      setError('');
      if (section === 'period-close') {
        setData({});
        return;
      }
      setData(await api<Item>(endpoint));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    setData(null);
    setForm({});
    setCreating(false);
    void refresh();
  }, [api, section]);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  async function send(path: string, method: string, input: unknown, after?: () => void) {
    setBusy(true);
    setError('');
    try {
      const result = await api<Item>(path, { method, body: JSON.stringify(input) });
      notify('عملیات انجام شد.');
      after?.();
      await refresh();
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="مدیریت فضای کاری"
        title={titles[section]}
        description={
          section === 'subscription'
            ? 'جزئیات پلن، تاریخ اعتبار و پرداخت‌های سازمان.'
            : section === 'integrations'
              ? 'پیش‌نمایش درخواست‌ها و پیگیری نتیجهٔ اتصال‌ها.'
              : section === 'payroll-rules'
                ? 'هر نسخه با تاریخ اعتبار و مرجع خود ذخیره می‌شود.'
                : 'تنظیمات مرتبط با حساب و دورهٔ مالی شما.'
        }
      >
        <button className="btn" onClick={refresh}>
          <RefreshCw size={17} /> به‌روزرسانی
        </button>
      </PageHeading>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {!data && !error && (
        <div className="loading-screen">
          <div className="spinner" />
        </div>
      )}
      {section === 'subscription' && data && (
        <>
          <div className="subscription-hero">
            <div>
              <span className="eyebrow">{data.organization?.name}</span>
              <h2>{data.subscription?.plan.name || 'بدون پلن'}</h2>
              <p>
                اعتبار تا {day(data.subscription?.endsAt)} ·{' '}
                {stateLabel(data.subscription?.status || '')}
              </p>
            </div>
            <div className="subscription-stamp">
              <ShieldCheck size={34} />
              <span>
                {data.subscription && new Date(data.subscription.endsAt) > new Date()
                  ? 'اشتراک جاری'
                  : 'نیازمند تمدید'}
              </span>
            </div>
          </div>
          <div className="plan-grid">
            {data.plans.map((plan: Item) => (
              <section className="panel plan-card" key={plan.id}>
                <span className="eyebrow">{format(plan.durationDays)} روز اشتراک</span>
                <h2>{plan.name}</h2>
                <strong>
                  {format(plan.price)} <small>ریال</small>
                </strong>
                <ul>
                  {[
                    [plan.companyLimit, 'شرکت مستقل'],
                    [plan.userLimit, 'عضو در تیم'],
                    [plan.documentLimit, 'سند در ماه'],
                  ].map(([v, t]) => (
                    <li key={t}>
                      <Check size={16} />
                      {format(v)} {t}
                    </li>
                  ))}
                </ul>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={async () => {
                    const result = await send('billing/checkout', 'POST', { planId: plan.id });
                    if (result?.url) location.href = result.url;
                  }}
                >
                  پرداخت آزمایشی <ArrowUpLeft size={17} />
                </button>
              </section>
            ))}
          </div>
          <p className="muted">
            پرداخت در sandbox زرین‌پال انجام می‌شود و مبلغ واقعی از حساب شما برداشت نمی‌شود.
          </p>
          <SmartTable
            title="سوابق پرداخت اشتراک"
            rows={data.payments}
            columns={[
              {
                key: 'createdAt',
                label: 'تاریخ',
                text: (r) => day(r.createdAt),
                render: (r) => day(r.createdAt),
              },
              { key: 'amount', label: 'مبلغ · ریال', render: (r) => format(r.amount) },
              {
                key: 'status',
                label: 'وضعیت',
                text: (r) => stateLabel(r.status),
                render: (r) => stateLabel(r.status),
              },
              { key: 'reference', label: 'شماره پیگیری' },
              { key: 'authority', label: 'شناسه درگاه' },
            ]}
          />
        </>
      )}
      {section === 'profile' && data && (
        <div className="service-columns">
          <section className="panel form-panel">
            <h2>{data.user.name}</h2>
            <p dir="ltr">{data.user.email}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send('auth/password', 'POST', form, () => setForm({}));
              }}
            >
              <Input
                label="رمز فعلی"
                name="currentPassword"
                type="password"
                value={form.currentPassword}
                onChange={set}
              />
              <Input
                label="رمز جدید · حداقل ۱۲ نویسه"
                name="password"
                type="password"
                value={form.password}
                onChange={set}
              />
              <button disabled={busy} className="btn btn-primary">
                تغییر رمز
              </button>
            </form>
          </section>
          <section className="panel form-panel">
            <h2>سازمان‌های من</h2>
            <p className="muted">با تغییر سازمان، محدودهٔ شرکت و سال مالی بازنشانی می‌شود.</p>
            {data.organizations.map((m: Item) => (
              <div key={m.organization.id} className="organization-switch-row">
                <div>
                  <strong>{m.organization.name}</strong>
                  <small>{m.role}</small>
                </div>
                <button
                  className="btn btn-small"
                  disabled={busy || data.organizationId === m.organization.id}
                  onClick={async () => {
                    const r = await send('auth/switch', 'POST', {
                      organizationId: m.organization.id,
                    });
                    if (r) {
                      localStorage.removeItem('taraz-scope');
                      location.href = '/dashboard';
                    }
                  }}
                >
                  {data.organizationId === m.organization.id ? 'سازمان جاری' : 'ورود'}
                </button>
              </div>
            ))}
            {boot?.user.role === 'مدیر' && (
              <form
                className="invite-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send('invitations', 'POST', {
                    email: form.inviteEmail,
                    role: form.inviteRole || 'VIEWER',
                  });
                }}
              >
                <h3>دعوت حساب موجود</h3>
                <Input
                  label="ایمیل عضو"
                  name="inviteEmail"
                  type="email"
                  value={form.inviteEmail}
                  onChange={set}
                />
                <Input
                  label="نقش عضویت"
                  name="inviteRole"
                  value={form.inviteRole || 'VIEWER'}
                  onChange={set}
                  options={[
                    { value: 'VIEWER', label: 'مشاهده‌گر' },
                    { value: 'ACCOUNTANT', label: 'حسابدار' },
                    { value: 'ADMIN', label: 'مدیر' },
                  ]}
                />
                <p className="field-help">
                  در اجرای محلی، پیوند دعوت در صندوق خروجی خصوصی سرور ذخیره می‌شود.
                </p>
                <button className="btn" disabled={busy}>
                  ساخت دعوت
                </button>
              </form>
            )}
          </section>
        </div>
      )}
      {section === 'payroll-rules' && data && (
        <>
          <div className="service-intro">
            <div>
              <h2>قواعد معتبر برای هر دوره</h2>
              <p>
                قاعدهٔ نمونه برای بررسی است. پیش از تأیید، بخشنامهٔ قابل اعمال به شرکت را با مبالغ و
                معافیت‌ها تطبیق دهید.
              </p>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => {
                setForm({
                  name: 'قواعد حقوق ۱۴۰۵',
                  from: '2026-03-21',
                  to: '2027-03-20',
                  rules: structuredClone(data.sample),
                  verified: false,
                  source: '',
                });
                setCreating(true);
              }}
            >
              <Plus size={17} /> نسخهٔ جدید
            </button>
          </div>
          {creating && (
            <form
              className="panel form-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void send('payroll-rules', 'POST', form, () => setCreating(false));
              }}
            >
              <h2>تعریف نسخهٔ قواعد</h2>
              <div className="form-grid">
                <Input name="name" label="نام نسخه" value={form.name} onChange={set} />
                <Input
                  name="source"
                  label="شماره بخشنامه یا نشانی مرجع"
                  value={form.source}
                  onChange={set}
                />
                <Input
                  name="from"
                  label="شروع اعتبار · میلادی"
                  type="date"
                  value={form.from}
                  onChange={set}
                />
                <Input
                  name="to"
                  label="پایان اعتبار · میلادی"
                  type="date"
                  value={form.to}
                  onChange={set}
                />
                {[
                  ['minimumDailyIRR', 'حداقل مزد روزانه · ریال'],
                  ['insuranceCeilingMultiple', 'ضریب سقف بیمه'],
                  ['employeeInsurancePercent', 'درصد بیمه کارمند'],
                  ['employerInsurancePercent', 'درصد بیمه کارفرما'],
                  ['unemploymentPercent', 'درصد بیمه بیکاری'],
                  ['insuranceTaxDeductionPercent', 'درصد حق بیمه قابل کسر از پایه مالیات'],
                  ['hourlyDivisor', 'ساعات مبنای حقوق ماهانه'],
                  ['overtimeMultiplier', 'ضریب اضافه‌کاری'],
                ].map(([k, label]) => (
                  <Input
                    key={k}
                    name={k}
                    label={label}
                    type="number"
                    value={form.rules?.[k]}
                    onChange={(name, v) => set('rules', { ...form.rules, [name]: v })}
                  />
                ))}
              </div>
              <h3>پلکان مالیات ماهانه · ریال</h3>
              <div className="tax-brackets">
                {form.rules?.taxBrackets.map((b: Item, i: number) => (
                  <div key={i}>
                    <Input
                      name="upToIRR"
                      label={`سقف پله ${format(i + 1)}`}
                      required={false}
                      value={b.upToIRR ?? ''}
                      type="number"
                      hint={
                        i === form.rules.taxBrackets.length - 1
                          ? 'پلهٔ آخر: خالی یعنی نامحدود'
                          : undefined
                      }
                      onChange={(_, v) => {
                        const rows = [...form.rules.taxBrackets];
                        rows[i] = { ...b, upToIRR: v === '' ? null : v };
                        set('rules', { ...form.rules, taxBrackets: rows });
                      }}
                    />
                    <Input
                      name="rate"
                      label="درصد مالیات"
                      type="number"
                      value={b.rate}
                      onChange={(_, v) => {
                        const rows = [...form.rules.taxBrackets];
                        rows[i] = { ...b, rate: v };
                        set('rules', { ...form.rules, taxBrackets: rows });
                      }}
                    />
                  </div>
                ))}
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.verified === true}
                  onChange={(e) => set('verified', e.target.checked)}
                />
                مقادیر و مرجع را بررسی کرده‌ام؛ این نسخه برای ثبت قطعی حقوق تأیید است.
              </label>
              <div className="saas-form-actions">
                <button className="btn" type="button" onClick={() => setCreating(false)}>
                  انصراف
                </button>
                <button className="btn btn-primary" disabled={busy}>
                  ثبت نسخه
                </button>
              </div>
            </form>
          )}
          <SmartTable
            title="نسخه‌های قواعد حقوق"
            rows={data.rows}
            columns={[
              { key: 'name', label: 'نام نسخه' },
              { key: 'from', label: 'شروع', text: (r) => day(r.from), render: (r) => day(r.from) },
              { key: 'to', label: 'پایان', text: (r) => day(r.to), render: (r) => day(r.to) },
              { key: 'source', label: 'مرجع' },
              {
                key: 'verified',
                label: 'تأیید مدیر',
                text: (r) => (r.verified ? 'تأیید شده' : 'نیازمند بررسی'),
                render: (r) => (r.verified ? 'تأیید شده' : 'نیازمند بررسی'),
              },
            ]}
          />
        </>
      )}
      {section === 'integrations' && data && (
        <>
          <div className="integration-grid">
            {[
              {
                key: 'modian',
                name: 'سامانه مودیان',
                text: 'امضا، رمزگذاری و پیگیری صورتحساب؛ الگوی یک فروش.',
              },
              { key: 'smsir', name: 'sms.ir', text: 'پیش‌نمایش پیامک در صندوق خروجی محلی.' },
            ].map((provider) => {
              const current = data.configs.find((c: Item) => c.provider === provider.key);
              return (
                <section className="panel form-panel" key={provider.key}>
                  <span className="eyebrow">{current?.mode || 'تنظیم نشده'}</span>
                  <h2>{provider.name}</h2>
                  <p className="muted">{provider.text}</p>
                  <span className={`saas-badge ${current?.enabled ? 'good' : 'warn'}`}>
                    {current?.enabled ? 'فعال' : 'غیرفعال'}
                  </span>
                  <button
                    className="btn"
                    onClick={() => {
                      setForm({
                        provider: provider.key,
                        mode: current?.mode || 'dry-run',
                        enabled: current?.enabled ?? true,
                        config: {},
                      });
                      setCreating(true);
                    }}
                  >
                    تنظیم اتصال
                  </button>
                </section>
              );
            })}
          </div>
          {creating && (
            <form
              className="panel form-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void send('integrations/' + form.provider, 'PATCH', form, () => setCreating(false));
              }}
            >
              <h2>تنظیم {form.provider === 'modian' ? 'مودیان' : 'پیامک'}</h2>
              <div className="form-grid">
                <Input
                  label="محیط"
                  name="mode"
                  value={form.mode}
                  onChange={set}
                  options={
                    form.provider === 'modian'
                      ? [
                          { value: 'dry-run', label: 'پیش‌نمایش محلی' },
                          { value: 'sandbox', label: 'سامانهٔ آزمایشی رسمی' },
                        ]
                      : [{ value: 'dry-run', label: 'پیش‌نمایش محلی' }]
                  }
                />
                <Input
                  label="وضعیت اتصال"
                  name="enabled"
                  value={String(form.enabled)}
                  onChange={(_, v) => set('enabled', v === 'true')}
                  options={[
                    { value: 'true', label: 'فعال' },
                    { value: 'false', label: 'غیرفعال' },
                  ]}
                />
                {form.provider === 'modian' && (
                  <>
                    <Input
                      label="شناسه یکتای حافظه مالیاتی"
                      name="fiscalId"
                      value={form.config.fiscalId}
                      onChange={(k, v) => set('config', { ...form.config, [k]: v })}
                      required={false}
                    />
                    {form.mode === 'sandbox' && (
                      <>
                        <Input
                          label="گواهی امضای PEM"
                          name="certificate"
                          type="textarea"
                          value={form.config.certificate}
                          onChange={(k, v) => set('config', { ...form.config, [k]: v })}
                          required={false}
                        />
                        <Input
                          label="کلید خصوصی PEM"
                          name="privateKey"
                          type="textarea"
                          value={form.config.privateKey}
                          onChange={(k, v) => set('config', { ...form.config, [k]: v })}
                          required={false}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
              <p className="field-help">
                اطلاعات محرمانه رمزگذاری می‌شوند و در خواندن تنظیمات بازگردانده نمی‌شوند. مقدار خالی
                را برای حفظ تنظیم قبلی وارد نکنید.
              </p>
              <div className="saas-form-actions">
                <button type="button" className="btn" onClick={() => setCreating(false)}>
                  انصراف
                </button>
                <button className="btn btn-primary" disabled={busy}>
                  ذخیره تنظیمات
                </button>
              </div>
            </form>
          )}
          <div className="service-columns">
            <form
              className="panel form-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void send('integrations/modian', 'POST', {
                  recordId: form.recordId,
                  taxId: form.taxId,
                  serial: form.serial,
                });
              }}
            >
              <h2>صورتحساب الکترونیکی</h2>
              <Input
                label="فاکتور فروش قطعی"
                name="recordId"
                value={form.recordId}
                onChange={set}
                options={
                  boot?.lookups.sales
                    ?.filter((r) => r.postedAt && !r.reversedAt)
                    .map((r) => ({ value: r.id, label: String(r.code) })) || []
                }
              />
              <Input
                label="شماره مالیاتی ۲۲ نویسه‌ای"
                name="taxId"
                value={form.taxId}
                onChange={set}
              />
              <Input label="سریال مالیاتی" name="serial" value={form.serial} onChange={set} />
              <button className="btn btn-primary" disabled={busy}>
                قرار دادن در صف
              </button>
            </form>
            <form
              className="panel form-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void send('integrations/smsir', 'POST', {
                  mobile: form.mobile,
                  message: form.message,
                });
              }}
            >
              <h2>پیش‌نمایش پیامک</h2>
              <Input label="شماره همراه" name="mobile" value={form.mobile} onChange={set} />
              <Input
                label="متن پیام"
                name="message"
                type="textarea"
                value={form.message}
                onChange={set}
              />
              <p className="field-help">
                پیام واقعی ارسال نمی‌شود؛ وضعیت و محتوای درخواست در صف قابل بررسی است.
              </p>
              <button className="btn" disabled={busy}>
                ساخت پیش‌نمایش
              </button>
            </form>
          </div>
          <SmartTable
            title="صف و نتیجهٔ درخواست‌ها"
            rows={data.jobs}
            columns={[
              { key: 'provider', label: 'ارائه‌دهنده' },
              {
                key: 'createdAt',
                label: 'تاریخ',
                text: (r) => day(r.createdAt),
                render: (r) => day(r.createdAt),
              },
              {
                key: 'status',
                label: 'وضعیت',
                text: (r) => stateLabel(r.status),
                render: (r) => stateLabel(r.status),
              },
              { key: 'attempts', label: 'تلاش‌ها' },
              { key: 'recordId', label: 'سند مرتبط' },
              {
                key: 'result',
                label: 'نتیجه',
                text: (r) => JSON.stringify(r.result),
                render: (r) => (
                  <details>
                    <summary>مشاهده</summary>
                    <pre className="result-json">{JSON.stringify(r.result, null, 2)}</pre>
                  </details>
                ),
              },
            ]}
            action={(r) =>
              ['FAILED', 'REVIEW_REQUIRED'].includes(r.status) ? (
                <button
                  disabled={busy}
                  className="btn btn-small"
                  onClick={() => send(`integrations/${r.id}/retry`, 'POST', {})}
                >
                  تلاش مجدد
                </button>
              ) : null
            }
          />
        </>
      )}
      {section === 'period-close' && data && (
        <section className="panel form-panel period-panel">
          <ShieldCheck size={32} />
          <h2>
            پایان دورهٔ{' '}
            {String(boot?.years.find((y) => y.id === boot.scope.yearId)?.name || 'جاری')}
          </h2>
          <p>
            اسناد پیش‌نویس باید تعیین تکلیف شده باشند. حساب‌های درآمد و هزینه به سود و زیان انباشته
            بسته می‌شوند. ماندهٔ حساب‌های دائمی و موجودی انبار به‌صورت پیوسته در دسترس دورهٔ بعد
            است.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirm(true);
            }}
          >
            <div className="form-grid">
              <Input
                name="nextName"
                label="نام سال مالی بعد"
                value={form.nextName}
                onChange={set}
              />
              <Input name="nextCode" label="کد سال مالی بعد" value={form.nextCode} onChange={set} />
              <Input
                name="nextEndDate"
                label="پایان سال بعد · میلادی"
                type="date"
                value={form.nextEndDate}
                onChange={set}
              />
            </div>
            <button className="btn btn-primary" disabled={busy || boot?.user.role !== 'مدیر'}>
              بررسی و بستن سال مالی
            </button>
          </form>
          <Link href="/reports/trial-balance">
            مشاهده تراز آزمایشی پیش از بستن <ArrowUpLeft size={15} />
          </Link>
        </section>
      )}
      {confirm && (
        <Confirm
          title="بستن قطعی سال مالی"
          description="پس از بستن، ثبت و تغییر سند در این دوره متوقف می‌شود. حساب‌های موقت بسته خواهند شد."
          onClose={() => setConfirm(false)}
          busy={busy}
          onConfirm={async () => {
            const result = await send('period-close', 'POST', form);
            if (result) {
              setConfirm(false);
              await reload();
            }
          }}
        />
      )}
    </>
  );
}
export function Attachments({ recordId, posted }: { recordId: string; posted: boolean }) {
  const { api, scope, notify, canWrite } = useApp();
  const [rows, setRows] = useState<Item[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function refresh() {
    try {
      const d = await api<Item>('attachments?recordId=' + recordId);
      setRows(d.rows);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, [recordId, api]);
  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('حداکثر اندازه ۵ مگابایت است.');
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api('attachments', {
        method: 'POST',
        body: JSON.stringify({ recordId, name: file.name, base64 }),
      });
      await refresh();
      notify('پیوست ذخیره شد.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel form-panel no-print">
      <div className="panel-heading">
        <h2>
          <Paperclip size={18} /> پیوست‌های سند
        </h2>
        {canWrite && (
          <label className="btn">
            {busy ? 'در حال بارگذاری…' : 'افزودن پیوست'}
            <input
              className="sr-only"
              type="file"
              aria-label="افزودن پیوست"
              accept=".pdf,.png,.jpg,.jpeg"
              disabled={busy}
              onChange={(e) => {
                if (e.target.files?.[0]) void upload(e.target.files[0]);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <p className="muted">PDF یا تصویر · حداکثر ۵ مگابایت</p>
      {rows.map((r) => (
        <div key={r.id} className="attachment-row">
          <span>
            {r.name}
            <small>{format(r.size / 1024)} کیلوبایت</small>
          </span>
          <a
            className="icon-button"
            aria-label={`دریافت ${r.name}`}
            href={`/api/attachments/${r.id}?${new URLSearchParams(scope)}`}
          >
            <Download size={17} />
          </a>
          {canWrite && !posted && (
            <button
              className="icon-button"
              aria-label={`حذف ${r.name}`}
              onClick={async () => {
                try {
                  await api('attachments/' + r.id, { method: 'DELETE' });
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Trash2 size={17} />
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
