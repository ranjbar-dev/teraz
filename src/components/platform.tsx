'use client';
import { useEffect, useState } from 'react';
import {
  Building2,
  Users,
  ShieldCheck,
  Plus,
  LogOut,
  RefreshCw,
  ArrowUpLeft,
  X,
} from 'lucide-react';
import { Logo } from './icons';
import { SmartTable, Input, Item, request, format, day, stateLabel } from './saas-shared';
export function Platform() {
  const [data, setData] = useState<Item | null>(null),
    [error, setError] = useState(''),
    [tab, setTab] = useState('organizations'),
    [form, setForm] = useState<Item | null>(null),
    [mode, setMode] = useState(''),
    [busy, setBusy] = useState(false),
    [created, setCreated] = useState<Item | null>(null),
    [notice, setNotice] = useState('');
  async function refresh() {
    try {
      setData(await request('platform'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await request(
        mode === 'plan'
          ? `platform/plans${form?.id ? '/' + form.id : ''}`
          : mode === 'create'
            ? 'platform/organizations'
            : 'platform/organizations/' + form?.id,
        mode === 'create' || (mode === 'plan' && !form?.id) ? 'POST' : 'PATCH',
        form,
      );
      if (mode === 'create') setCreated(result);
      setForm(null);
      setNotice('تغییرات ذخیره شد.');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="platform-layout">
      <aside className="platform-nav">
        <Logo />
        <div className="platform-owner">
          <ShieldCheck size={23} />
          <div>
            <strong>مدیریت کل</strong>
            <small>کنترل سازمان‌ها و اشتراک‌ها</small>
          </div>
        </div>
        <nav>
          {[
            ['organizations', 'سازمان‌ها', Building2],
            ['plans', 'پلن‌های اشتراک', ShieldCheck],
            ['audit', 'سوابق مدیریت', Users],
          ].map(([key, label, Icon]) => (
            <button
              key={String(key)}
              className={tab === key ? 'selected' : ''}
              onClick={() => setTab(String(key))}
            >
              {typeof Icon !== 'string' && <Icon size={19} />}
              <span>{String(label)}</span>
            </button>
          ))}
        </nav>
        <div className="platform-nav-foot">
          <span className="live-dot" /> محیط محلی · پرداخت آزمایشی
        </div>
        <button
          className="btn"
          onClick={async () => {
            await request('auth', 'DELETE');
            location.href = '/login';
          }}
        >
          <LogOut size={17} /> خروج
        </button>
      </aside>
      <main className="platform-main">
        <header className="platform-top">
          <span>تراز / مدیریت سرویس</span>
          <span className="owner-badge">
            <ShieldCheck size={15} /> مدیر کل
          </span>
        </header>
        <div className="platform-heading">
          <div>
            <span className="eyebrow">دید کامل، مدیریت دقیق</span>
            <h1>
              {tab === 'organizations'
                ? 'سازمان‌های شما'
                : tab === 'plans'
                  ? 'پلن‌های اشتراک'
                  : 'تاریخچهٔ مدیریت'}
            </h1>
            <p>عضویت و دسترسی مشتریان را از یک نقطه مدیریت کنید.</p>
          </div>
          <div className="platform-heading-actions">
            <button className="btn" onClick={refresh}>
              <RefreshCw size={17} />
            </button>
            {tab !== 'audit' && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  setMode(tab === 'plans' ? 'plan' : 'create');
                  setForm(
                    tab === 'plans'
                      ? {
                          durationDays: 30,
                          companyLimit: 5,
                          userLimit: 20,
                          documentLimit: 10000,
                          active: true,
                        }
                      : { days: 30, planId: data?.plans[0]?.id },
                  );
                }}
              >
                <Plus size={18} />
                {tab === 'plans' ? 'پلن جدید' : 'ساخت سازمان'}
              </button>
            )}
          </div>
        </div>
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}
        {notice && (
          <div className="success-note" role="status">
            {notice}
          </div>
        )}
        {!data && !error && (
          <div className="loading-screen">
            <div className="spinner" />
          </div>
        )}
        {data && (
          <>
            <div className="platform-stats">
              {[
                ['سازمان‌های ثبت‌شده', data.stats.organizations, 'سازمان'],
                ['اشتراک‌های جاری', data.stats.active, 'سازمان'],
                ['کاربران سرویس', data.stats.users, 'کاربر'],
                ['پرداخت تأییدشدهٔ آزمایشی', data.stats.verifiedPayments, 'ریال'],
              ].map(([label, value, unit]) => (
                <section key={label}>
                  <small>{label}</small>
                  <strong>
                    {format(value)}
                    <em>{unit}</em>
                  </strong>
                  <span className="platform-stat-line" />
                </section>
              ))}
            </div>
            {tab === 'organizations' && (
              <SmartTable
                title="فهرست سازمان‌ها"
                rows={data.organizations.map((o: Item) => ({
                  ...o,
                  plan: o.subscription?.plan.name || '—',
                  endsAt: o.subscription?.endsAt,
                  people: o._count.memberships,
                  companies: o._count.companies,
                }))}
                columns={[
                  {
                    key: 'name',
                    label: 'سازمان',
                    render: (r) => (
                      <div className="organization-name">
                        <span>{r.name.charAt(0)}</span>
                        <div>
                          <strong>{r.name}</strong>
                          <small dir="ltr">{r.slug}</small>
                        </div>
                      </div>
                    ),
                  },
                  { key: 'slug', label: 'نشانی' },
                  { key: 'plan', label: 'پلن' },
                  {
                    key: 'status',
                    label: 'وضعیت',
                    text: (r) => stateLabel(r.status),
                    render: (r) => (
                      <span className={`saas-badge ${r.status === 'ACTIVE' ? 'good' : 'warn'}`}>
                        {stateLabel(r.status)}
                      </span>
                    ),
                  },
                  {
                    key: 'endsAt',
                    label: 'پایان اشتراک',
                    text: (r) => day(r.endsAt),
                    render: (r) => day(r.endsAt),
                  },
                  { key: 'companies', label: 'شرکت‌ها', render: (r) => format(r.companies) },
                  { key: 'people', label: 'اعضا', render: (r) => format(r.people) },
                ]}
                action={(r) => (
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      setMode('edit');
                      setForm({
                        id: r.id,
                        name: r.name,
                        status: r.status,
                        planId: r.subscription?.planId,
                        subscriptionStatus: r.subscription?.status,
                        days: 0,
                      });
                    }}
                  >
                    مدیریت <ArrowUpLeft size={14} />
                  </button>
                )}
              />
            )}
            {tab === 'plans' && (
              <SmartTable
                title="پلن‌های قابل ارائه"
                rows={data.plans}
                columns={[
                  { key: 'name', label: 'نام پلن' },
                  { key: 'price', label: 'قیمت · ریال', render: (r) => format(r.price) },
                  { key: 'durationDays', label: 'مدت · روز' },
                  { key: 'companyLimit', label: 'ظرفیت شرکت' },
                  { key: 'userLimit', label: 'ظرفیت کاربر' },
                  { key: 'documentLimit', label: 'اسناد ماهانه' },
                  {
                    key: 'active',
                    label: 'وضعیت',
                    text: (r) => (r.active ? 'فعال' : 'غیرفعال'),
                    render: (r) => (r.active ? 'فعال' : 'غیرفعال'),
                  },
                ]}
                action={(r) => (
                  <button
                    className="btn btn-small"
                    onClick={() => {
                      setMode('plan');
                      setForm(r);
                    }}
                  >
                    ویرایش
                  </button>
                )}
              />
            )}
            {tab === 'audit' && (
              <SmartTable
                title="رویدادهای مدیر کل"
                rows={data.audit}
                columns={[
                  {
                    key: 'createdAt',
                    label: 'تاریخ',
                    text: (r) => day(r.createdAt),
                    render: (r) => day(r.createdAt),
                  },
                  { key: 'userName', label: 'کاربر' },
                  { key: 'action', label: 'عملیات' },
                  { key: 'message', label: 'شرح' },
                  { key: 'targetId', label: 'شناسهٔ مرتبط' },
                ]}
              />
            )}
          </>
        )}
        {form && (
          <div className="saas-dialog-backdrop">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="platform-form-title"
              className="saas-dialog"
            >
              <div className="panel-heading">
                <h2 id="platform-form-title">
                  {mode === 'create'
                    ? 'ساخت سازمان و مدیر اولیه'
                    : mode === 'plan'
                      ? 'اطلاعات پلن'
                      : 'اشتراک ' + form.name}
                </h2>
                <button className="icon-button" aria-label="بستن" onClick={() => setForm(null)}>
                  <X size={19} />
                </button>
              </div>
              <form onSubmit={save}>
                {error && (
                  <div className="form-error" role="alert">
                    {error}
                  </div>
                )}
                <div className="form-grid">
                  {mode === 'create' && (
                    <>
                      {[
                        ['name', 'نام سازمان'],
                        ['slug', 'نشانی لاتین سازمان'],
                        ['ownerName', 'نام مدیر'],
                        ['ownerEmail', 'ایمیل مدیر'],
                      ].map(([name, label]) => (
                        <Input
                          key={name}
                          name={name}
                          label={label}
                          type={name === 'ownerEmail' ? 'email' : 'text'}
                          value={form[name]}
                          onChange={set}
                        />
                      ))}
                    </>
                  )}
                  {mode === 'plan' ? (
                    <>
                      <Input name="name" label="نام پلن" value={form.name} onChange={set} />
                      {[
                        ['price', 'قیمت · ریال'],
                        ['durationDays', 'مدت اشتراک · روز'],
                        ['companyLimit', 'حداکثر شرکت'],
                        ['userLimit', 'حداکثر کاربر'],
                        ['documentLimit', 'حداکثر سند در ماه'],
                      ].map(([name, label]) => (
                        <Input
                          key={name}
                          name={name}
                          label={label}
                          type="number"
                          value={form[name]}
                          onChange={set}
                        />
                      ))}
                      <Input
                        name="active"
                        label="وضعیت عرضه"
                        value={String(form.active)}
                        onChange={(_, v) => set('active', v === 'true')}
                        options={[
                          { value: 'true', label: 'فعال' },
                          { value: 'false', label: 'غیرفعال' },
                        ]}
                      />
                    </>
                  ) : (
                    <>
                      <Input
                        name="planId"
                        label="پلن اشتراک"
                        value={form.planId}
                        onChange={set}
                        options={data?.plans.map((p: Item) => ({ value: p.id, label: p.name }))}
                      />
                      <Input
                        name="days"
                        label={mode === 'create' ? 'مدت اولیه · روز' : 'افزودن به اشتراک · روز'}
                        type="number"
                        value={form.days}
                        onChange={set}
                      />
                      {mode === 'edit' && (
                        <>
                          <Input
                            name="status"
                            label="دسترسی سازمان"
                            value={form.status}
                            onChange={set}
                            options={['ACTIVE', 'SUSPENDED'].map((v) => ({
                              value: v,
                              label: stateLabel(v),
                            }))}
                          />
                          <Input
                            name="subscriptionStatus"
                            label="وضعیت اشتراک"
                            value={form.subscriptionStatus}
                            onChange={set}
                            options={['ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED'].map((v) => ({
                              value: v,
                              label: stateLabel(v),
                            }))}
                          />
                        </>
                      )}
                    </>
                  )}
                </div>
                <div className="saas-form-actions">
                  <button type="button" className="btn" onClick={() => setForm(null)}>
                    انصراف
                  </button>
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? 'در حال ذخیره…' : 'ذخیره'}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}
        {created && (
          <div className="saas-dialog-backdrop">
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="created-title"
              className="saas-dialog"
            >
              <div className="panel-heading">
                <h2 id="created-title">سازمان آماده است</h2>
              </div>
              <p>
                این اطلاعات فقط همین بار نمایش داده می‌شود. مدیر سازمان می‌تواند پس از ورود رمز خود
                را تغییر دهد.
              </p>
              <label className="field">
                <span>ایمیل مدیر</span>
                <input className="input" readOnly dir="ltr" value={created.owner.email} />
              </label>
              <label className="field">
                <span>رمز اولیه</span>
                <input
                  className="input"
                  readOnly
                  dir="ltr"
                  value={created.owner.temporaryPassword}
                />
              </label>
              <button className="btn btn-primary" onClick={() => setCreated(null)}>
                اطلاعات را نگه داشتم
              </button>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
