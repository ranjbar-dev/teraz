'use client';
import { Attachments } from './workspace-services';
import { SearchSelect } from './search-select';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  ArrowUpLeft,
  Pencil,
  Trash2,
  Printer,
  Copy,
  Save,
  RefreshCw,
  AlertCircle,
  LockKeyhole,
} from 'lucide-react';
import { useApp } from './provider';
import { PageHeading, Loading, Badge, Confirm } from './ui';
import { Icon } from './icons';
import { DataTable, normalize, type Column, type TableRow } from './data-table';
import { DatePicker } from './date-picker';
import { masterKeys } from '@/lib/modules';
import { active, invoiceTotals, number } from '@/lib/domain';
import type { Module, Row, Line, Field } from '@/lib/types';

export function useRows(key: string) {
  const { api, currency } = useApp();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const refresh = async () => {
    try {
      const data = await api<{ rows: Row[] }>(key);
      setRows(data.rows);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError('');
    api<{ rows: Row[] }>(key)
      .then((d) => {
        if (!cancelled) setRows(d.rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api, key]);
  return { rows, error, refresh };
}
export function ModuleList({ mod }: { mod: Module }) {
  const { rows, error, refresh } = useRows(mod.key);
  const { boot, fmt, canWrite, currency } = useApp();
  const router = useRouter();
  const [status, setStatus] = useState('all');
  if (error)
    return (
      <div className="empty-state">
        <AlertCircle size={32} />
        <h2>{error}</h2>
        <button className="btn" onClick={refresh}>
          تلاش دوباره
        </button>
      </div>
    );
  if (!rows) return <Loading />;
  const defaultKeys = [
    'code',
    'name',
    'personId',
    'employeeId',
    'projectId',
    'productId',
    'assetId',
    'bomId',
    'date',
    'dueDate',
    'type',
    'category',
    'phone',
    'amount',
    'price',
    'quantity',
    'role',
    'email',
    'rate',
    'progress',
    'budget',
    'warehouseId',
    'startDate',
    'endDate',
  ];
  const columns: Column[] = mod.fields
    .filter((f) => !f.hidden)
    .map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      hidden: !defaultKeys.includes(f.key),
      ...(f.ref
        ? {
            text: (r: TableRow) => {
              const ref = boot?.lookups[f.ref!]?.find((x) => x.id === r[f.key]);
              return String(ref?.name || ref?.code || '—');
            },
            render: (r: TableRow) => {
              const ref = boot?.lookups[f.ref!]?.find((x) => x.id === r[f.key]);
              const name = String(ref?.name || ref?.code || '—');
              return (
                <span className={['personId', 'employeeId'].includes(f.key) ? 'person-cell' : ''}>
                  {['personId', 'employeeId'].includes(f.key) && (
                    <span className={`avatar avatar-small tone-${name.length % 4}`}>
                      {name.charAt(0)}
                    </span>
                  )}
                  {name}
                </span>
              );
            },
          }
        : {}),
      ...(f.key === 'code'
        ? {
            render: (r: TableRow) => (
              <span className="document-code">
                <span className="document-icon">
                  <Icon name={mod.icon} size={15} />
                </span>
                {String(r.code)}
              </span>
            ),
          }
        : {}),
    }));
  if (mod.kind || ['payroll', 'depreciation'].includes(mod.key))
    columns.push({
      key: 'total',
      label:
        mod.key === 'payroll'
          ? 'خالص پرداختنی'
          : mod.key === 'depreciation'
            ? 'مبلغ استهلاک'
            : 'مبلغ کل',
      type: 'money',
    });
  if (['sales', 'purchases'].includes(mod.key))
    columns.push(
      { key: 'paid', label: 'تسویه‌شده', type: 'money', hidden: true },
      { key: 'remaining', label: 'مانده', type: 'money', hidden: true },
    );
  if (mod.key === 'banks') columns.push({ key: 'balance', label: 'مانده حساب', type: 'money' });
  if (mod.key === 'assets') columns.push({ key: 'bookValue', label: 'ارزش دفتری', type: 'money' });
  if (mod.status) columns.push({ key: 'status', label: 'وضعیت' });
  const sumKey =
    mod.kind || ['payroll', 'depreciation'].includes(mod.key)
      ? 'total'
      : mod.key === 'banks'
        ? 'balance'
        : mod.key === 'projects'
          ? 'budget'
          : mod.key === 'assets'
            ? 'cost'
            : 'amount';
  const sum = rows.reduce(
    (s, r) =>
      s +
      number(r[sumKey]) *
        (number(r.exchangeRate) ||
          (mod.key === 'banks'
            ? number(boot?.lookups.currencies?.find((c) => c.name === r.currency)?.rate) || 1
            : 1)),
    0,
  );
  return (
    <>
      <PageHeading eyebrow={mod.group} title={mod.title} description={mod.description}>
        <button className="btn" onClick={refresh}>
          <RefreshCw size={16} /> به‌روزرسانی
        </button>
        {canWrite && (
          <Link className="btn btn-primary" href={`/${mod.key}/new`}>
            <Plus size={18} />
            {mod.singular} جدید
          </Link>
        )}
      </PageHeading>
      <div className="module-overview">
        <div>
          <span className="module-overview-icon">
            <Icon name={mod.icon} size={24} />
          </span>
          <span>
            <small>تعداد کل {mod.title}</small>
            <strong>
              {fmt(rows.length)} <em>مورد</em>
            </strong>
          </span>
        </div>
        {mod.status && (
          <div>
            <span className="overview-dot green" />
            <span>
              <small>{mod.status.includes('تأیید شده') ? 'اسناد تأییدشده' : mod.status[0]}</small>
              <strong>
                {fmt(
                  rows.filter(
                    (r) =>
                      r.status ===
                      (mod.status?.includes('تأیید شده') ? 'تأیید شده' : mod.status?.[0]),
                  ).length,
                )}{' '}
                <em>مورد</em>
              </strong>
            </span>
          </div>
        )}
        {sum !== 0 && (
          <div>
            <span className="overview-dot mint" />
            <span>
              <small>
                {sumKey === 'budget'
                  ? 'مجموع بودجه'
                  : sumKey === 'balance'
                    ? 'مجموع مانده'
                    : 'مجموع مبالغ'}{' '}
                · همه وضعیت‌ها
              </small>
              <strong>
                {fmt(sum)} <em>{currency}</em>
              </strong>
            </span>
          </div>
        )}
        <div className="module-scope-note">
          <Icon name="building" size={16} />
          <span>
            {String(boot?.companies.find((c) => c.id === boot.scope.companyId)?.name)}
            <small>
              {boot?.scope.branchId === 'all'
                ? 'تمام شعبه‌ها'
                : String(boot?.branches.find((b) => b.id === boot.scope.branchId)?.name || '')}
            </small>
          </span>
        </div>
      </div>
      <section className="panel module-table-panel">
        {mod.status && (
          <div className="status-tabs">
            <button className={status === 'all' ? 'selected' : ''} onClick={() => setStatus('all')}>
              همه <span>{fmt(rows.length)}</span>
            </button>
            {mod.status.map((s) => (
              <button
                key={s}
                className={status === s ? 'selected' : ''}
                onClick={() => setStatus(s)}
              >
                {s}
                <span>{fmt(rows.filter((r) => r.status === s).length)}</span>
              </button>
            ))}
          </div>
        )}
        <DataTable
          key={mod.key}
          rows={status === 'all' ? rows : rows.filter((r) => r.status === status)}
          columns={columns}
          title={mod.title}
          onView={(r) => router.push(`/${mod.key}/${r.id}`)}
          emptyAction={
            canWrite ? (
              <Link className="btn btn-primary" href={`/${mod.key}/new`}>
                <Plus size={16} /> ثبت اولین {mod.singular}
              </Link>
            ) : undefined
          }
        />
      </section>
    </>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  values,
}: {
  field: Field;
  value: unknown;
  onChange: (v: string | number) => void;
  values: Partial<Row>;
}) {
  const { boot, currency } = useApp();
  const options = field.ref
    ? boot?.lookups[field.ref]?.filter(
        (r) =>
          (r.status !== 'غیرفعال' || r.id === value) &&
          (field.ref !== 'products' ||
            !['stock', 'production'].includes(String(values._module)) ||
            r.type !== 'خدمت'),
      ) || []
    : [];
  if (field.type === 'date')
    return (
      <DatePicker
        label={field.label}
        value={String(value || '')}
        onChange={onChange}
        required={field.required}
      />
    );
  if (field.type === 'select')
    return (
      <SearchSelect
        className="input"
        aria-label={field.label}
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
      >
        <option value="">انتخاب کنید</option>
        {field.ref
          ? options.map((r) => (
              <option key={r.id} value={r.id}>
                {String(r.name || r.code)}
                {r.name && r.code ? ` · ${r.code}` : ''}
              </option>
            ))
          : field.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
      </SearchSelect>
    );
  if (field.type === 'textarea')
    return (
      <textarea
        className="input"
        rows={3}
        aria-label={field.label}
        value={String(value || '')}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${field.label} را بنویسید…`}
      />
    );
  const numeric = ['money', 'number'].includes(field.type || '');
  return (
    <div className="input-container">
      <input
        className="input"
        aria-label={field.label}
        type={field.key === 'password' ? 'password' : field.type === 'email' ? 'email' : 'text'}
        inputMode={numeric ? 'decimal' : undefined}
        dir={field.type === 'email' || field.key === 'iban' ? 'ltr' : undefined}
        value={String(value ?? '')}
        placeholder={
          numeric ? '۰' : field.key === 'password' ? 'حداقل ۸ نویسه' : `${field.label} را وارد کنید`
        }
        required={field.required}
        autoComplete={field.key === 'password' ? 'new-password' : 'off'}
        onChange={(e) => {
          const v = numeric ? normalize(e.target.value) : e.target.value;
          if (!numeric || /^-?\d*\.?\d*$/.test(v)) onChange(v);
        }}
      />
      {field.type === 'money' && (
        <span className="input-unit">{String(values.currency || currency)}</span>
      )}
    </div>
  );
}
export function EntityEditor({ mod, id }: { mod: Module; id?: string }) {
  const { api, boot, notify, reload, fmt, canWrite, setUnsaved, currency } = useApp();
  const router = useRouter();
  const [values, setValues] = useState<Partial<Row>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [payrollPreview, setPayrollPreview] = useState<Record<string, unknown> | null>(null);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (!boot) return;
    let cancelled = false;
    const setup = async () => {
      setLoaded(false);
      setLoadError('');
      try {
        if (id) {
          const row = await api<Row>(`${mod.key}/${id}`);
          if (!cancelled) setValues(row);
        } else {
          const today = new Date().toISOString().slice(0, 10);
          const year = boot.years.find((y) => y.id === boot.scope.yearId);
          const date =
            year && (today < String(year.startDate) || today > String(year.endDate))
              ? String(year.startDate)
              : today;
          const due = new Date(date + 'T12:00:00');
          due.setDate(due.getDate() + number(boot.settings.paymentTerms || 30));
          const prefix =
            mod.key === 'sales'
              ? boot.settings.invoicePrefix || 'TR'
              : mod.key.slice(0, 2).toUpperCase();
          const fields: Partial<Row> = Object.fromEntries(
            mod.fields.map((f) => [
              f.key,
              f.key === 'code'
                ? `${prefix}-${String(Date.now()).slice(-6)}`
                : f.key === 'date'
                  ? date
                  : f.key === 'dueDate'
                    ? due.toISOString().slice(0, 10)
                    : f.key === 'currency'
                      ? boot.settings.currency || currency
                      : (f.default ?? ''),
            ]),
          );
          if (fields.currency && mod.fields.some((f) => f.key === 'exchangeRate'))
            fields.exchangeRate =
              number(boot.lookups.currencies?.find((c) => c.name === fields.currency)?.rate) || 1;
          fields.branchId =
            boot.scope.branchId === 'all'
              ? boot.branches.find((b) => b.status === 'فعال')?.id || ''
              : boot.scope.branchId;
          const linkedId = new URL(window.location.href).searchParams.get('invoiceId');
          if (linkedId && ['receipts', 'payments'].includes(mod.key)) {
            const inv = boot.lookups[mod.key === 'receipts' ? 'sales' : 'purchases']?.find(
              (r) => r.id === linkedId,
            );
            if (inv) {
              Object.assign(fields, {
                invoiceId: inv.id,
                personId: inv.personId,
                branchId: inv.branchId,
                currency: inv.currency,
                exchangeRate: inv.exchangeRate,
                amount:
                  invoiceTotals(inv).total -
                  (boot.lookups[mod.key] || [])
                    .filter((r) => r.invoiceId === inv.id && active(r))
                    .reduce((s, r) => s + number(r.amount), 0),
              });
            }
          }
          if (!cancelled)
            setValues({
              ...fields,
              status: mod.status?.[0] || '',
              ...(mod.kind ? { lines: [newLine()] } : {}),
            });
        }
      } catch (e) {
        if (!cancelled) setLoadError((e as Error).message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };
    void setup();
    return () => {
      cancelled = true;
    };
  }, [id, mod, api, boot]);
  useEffect(() => {
    setUnsaved(dirty);
    return () => setUnsaved(false);
  }, [dirty, setUnsaved]);
  const update = (key: string, value: string | number | Line[]) => {
    setDirty(true);
    setValues((v) => {
      const next = { ...v, [key]: value };
      if (key === 'currency')
        next.exchangeRate =
          number(boot?.lookups.currencies?.find((r) => r.name === value)?.rate) || 1;
      if (key === 'employeeId')
        next.base = number(boot?.lookups.employees?.find((r) => r.id === value)?.salary);
      return next;
    });
  };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { ...values };
      delete body.total;
      delete body.paid;
      delete body.remaining;
      const result = await api<Row>(`${mod.key}${id ? `/${id}` : ''}`, {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      setDirty(false);
      setUnsaved(false);
      notify(`${mod.singular} با موفقیت ذخیره شد.`);
      await reload();
      router.push(`/${mod.key}/${result.id}`);
    } catch (e) {
      setError((e as Error).message);
      notify((e as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  if (!loaded) return <Loading />;
  if (loadError)
    return (
      <div className="empty-state">
        <AlertCircle size={30} />
        <h2>بارگذاری اطلاعات انجام نشد</h2>
        <p>{loadError}</p>
        <Link className="btn" href={`/${mod.key}`}>
          بازگشت به فهرست
        </Link>
      </div>
    );
  if (
    !masterKeys.has(mod.key) &&
    boot?.years.find((y) => y.id === boot.scope.yearId)?.status === 'بسته'
  )
    return (
      <div className="empty-state">
        <LockKeyhole size={30} />
        <h2>سال مالی بسته است</h2>
        <p>برای ثبت یا ویرایش، یک سال مالی باز را از نوار بالای صفحه انتخاب کنید.</p>
        <Link className="btn" href={`/${mod.key}`}>
          بازگشت به فهرست
        </Link>
      </div>
    );
  if (!canWrite || (mod.admin && boot?.user.role !== 'مدیر'))
    return (
      <div className="empty-state">
        <h2>شما دسترسی ثبت یا ویرایش ندارید.</h2>
        <Link href={`/${mod.key}`}>بازگشت به فهرست</Link>
      </div>
    );
  if (id && values.postedAt)
    return (
      <div className="empty-state">
        <h2>این سند تأیید شده است.</h2>
        <p>برای اصلاح، از صفحهٔ جزئیات سند برگشتی بسازید.</p>
        <Link className="btn" href={`/${mod.key}/${id}`}>
          جزئیات سند
        </Link>
      </div>
    );
  const total = invoiceTotals(values);
  const lines = (values.lines || []) as Line[];
  return (
    <>
      <PageHeading
        back={`/${mod.key}${id ? `/${id}` : ''}`}
        eyebrow={mod.group}
        title={`${id ? 'ویرایش' : 'ثبت'} ${mod.singular}`}
        description="اطلاعات را تکمیل کنید؛ فیلدهای ستاره‌دار ضروری هستند."
      >
        <span className="form-save-state">
          <i className={`live-dot ${dirty ? 'amber-dot' : ''}`} />
          {dirty ? 'تغییرات ذخیره نشده' : 'آمادهٔ ثبت'}
        </span>
      </PageHeading>
      {mod.key === 'payroll' && (
        <section className="panel form-panel">
          <h2>محاسبهٔ حقوق در سرور</h2>
          <p>بیمه و مالیات از نسخهٔ قواعد معتبر برای تاریخ فیش محاسبه می‌شوند.</p>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              try {
                setPayrollPreview(
                  await api<Record<string, unknown>>('payroll-calculate', {
                    method: 'POST',
                    body: JSON.stringify(values),
                  }),
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            محاسبه و پیش‌نمایش
          </button>
          <Link className="text-button" href="/payroll-rules">
            قواعد حقوق
          </Link>
          {payrollPreview && (
            <div className="report-summary">
              {[
                ['gross', 'ناخالص'],
                ['insurance', 'بیمه کارمند'],
                ['employerInsurance', 'بیمه کارفرما'],
                ['tax', 'مالیات'],
                ['total', 'خالص'],
              ].map(([key, label]) => (
                <div key={key}>
                  <small>{label}</small>
                  <strong>{fmt(payrollPreview[key])}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <form onSubmit={save} className="entity-form">
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} />
            {error}
          </div>
        )}
        <section className="panel form-panel">
          <div className="section-heading">
            <span className="section-step">۱</span>
            <div>
              <h2>اطلاعات {mod.singular}</h2>
              <p>
                {mod.kind ? 'مشخصات اولیه، طرف حساب و تاریخ سند' : 'مشخصات اصلی و اطلاعات تکمیلی'}
              </p>
            </div>
          </div>
          <div className="form-grid">
            {!masterKeys.has(mod.key) && (
              <label className="field">
                <span>
                  شعبه ثبت <b>*</b>
                </span>
                <SearchSelect
                  className="input"
                  aria-label="شعبه ثبت"
                  value={String(values.branchId || '')}
                  onChange={(e) => update('branchId', e.target.value)}
                  disabled={!!id || boot?.scope.branchId !== 'all'}
                  required
                >
                  {boot?.branches
                    .filter((b) => b.status === 'فعال')
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {String(b.name)}
                      </option>
                    ))}
                </SearchSelect>
              </label>
            )}
            {mod.fields
              .filter((f) => f.type !== 'textarea')
              .map((f) => (
                <label className="field" key={f.key}>
                  <span>
                    {f.label}
                    {f.required && <b>*</b>}
                  </span>
                  <FieldInput
                    field={f}
                    value={values[f.key]}
                    values={{ ...values, _module: mod.key }}
                    onChange={(v) => update(f.key, v)}
                  />
                  {f.ref && !boot?.lookups[f.ref]?.length && (
                    <Link className="field-help" href={`/${f.ref}/new`}>
                      ابتدا یک مورد ثبت کنید <ArrowUpLeft size={12} />
                    </Link>
                  )}
                </label>
              ))}
            {mod.status && (
              <label className="field">
                <span>وضعیت</span>
                <SearchSelect
                  className="input"
                  aria-label="وضعیت"
                  value={String(values.status || '')}
                  onChange={(e) => update('status', e.target.value)}
                >
                  {mod.status.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </SearchSelect>
              </label>
            )}
          </div>
        </section>
        {mod.kind && (
          <section className="panel form-panel line-panel">
            <div className="section-heading">
              <span className="section-step">۲</span>
              <div>
                <h2>
                  {mod.kind === 'journal'
                    ? 'آرتیکل‌های سند'
                    : mod.key === 'boms'
                      ? 'مواد اولیه برای یک واحد محصول'
                      : 'اقلام فاکتور'}
                </h2>
                <p>
                  {mod.kind === 'journal'
                    ? 'جمع بدهکار و بستانکار برای تأیید سند باید برابر باشد.'
                    : 'کالا را انتخاب کنید؛ قیمت، تخفیف و مالیات را می‌توانید تغییر دهید.'}
                </p>
              </div>
              <span className="count-pill">{fmt(lines.length)} ردیف</span>
            </div>
            <LineEditor mod={mod} lines={lines} onChange={(l) => update('lines', l)} />
            <button
              type="button"
              className="add-line-button"
              onClick={() => update('lines', [...lines, newLine()])}
            >
              <Plus size={17} /> افزودن ردیف جدید
            </button>
          </section>
        )}
        <div className={`form-bottom-grid ${mod.kind ? '' : 'single-column'}`}>
          <section className="panel form-panel">
            <h2>یادداشت و اطلاعات تکمیلی</h2>
            <div className="form-grid">
              {mod.fields
                .filter((f) => f.type === 'textarea')
                .map((f) => (
                  <label className="field field-full" key={f.key}>
                    <span>{f.label}</span>
                    <FieldInput
                      field={f}
                      value={values[f.key]}
                      values={values}
                      onChange={(v) => update(f.key, v)}
                    />
                  </label>
                ))}
              {!mod.fields.some((f) => f.type === 'textarea') && (
                <p className="muted">اطلاعات این فرم پس از ذخیره در صفحهٔ جزئیات قابل بررسی است.</p>
              )}
            </div>
            <div className="form-note">
              <Icon name="shield" size={18} />
              <p>
                اطلاعات در شرکت و سال مالی انتخاب‌شده ذخیره می‌شود.
                {boot?.scope.branchId === 'all' &&
                  ' شعبهٔ ثبت را در بالای فرم می‌توانید انتخاب کنید.'}
              </p>
            </div>
          </section>
          {mod.kind && (
            <section className="panel totals-panel">
              <h2>خلاصهٔ {mod.kind === 'journal' ? 'سند' : 'مبالغ'}</h2>
              {mod.kind === 'journal' ? (
                <>
                  <div>
                    <span>جمع بدهکار</span>
                    <strong>{fmt(lines.reduce((s, l) => s + number(l.debit), 0))}</strong>
                  </div>
                  <div>
                    <span>جمع بستانکار</span>
                    <strong>{fmt(lines.reduce((s, l) => s + number(l.credit), 0))}</strong>
                  </div>
                  <div className="grand-total">
                    <span>اختلاف تراز</span>
                    <strong>
                      {fmt(lines.reduce((s, l) => s + number(l.debit) - number(l.credit), 0))}
                    </strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>جمع اقلام</span>
                    <strong>{fmt(total.subtotal)}</strong>
                  </div>
                  <div>
                    <span>تخفیف‌ها</span>
                    <strong className="danger-text">{fmt(total.discount)}</strong>
                  </div>
                  <div>
                    <span>مالیات و عوارض</span>
                    <strong>{fmt(total.tax)}</strong>
                  </div>
                  <div className="grand-total">
                    <span>مبلغ نهایی</span>
                    <strong>
                      {fmt(total.total)}
                      <small>{String(values.currency || currency)}</small>
                    </strong>
                  </div>
                  {values.currency && values.currency !== currency && (
                    <div>
                      <span>معادل {currency}</span>
                      <strong>{fmt(total.total * number(values.exchangeRate))}</strong>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
          {mod.key === 'payroll' && (
            <section className="panel totals-panel">
              <h2>خالص پرداختنی</h2>
              <div className="grand-total">
                <strong>
                  {fmt(
                    number(values.base) +
                      number(values.benefits) -
                      number(values.tax) -
                      number(values.insurance) -
                      number(values.deductions),
                  )}
                  <small>{currency}</small>
                </strong>
              </div>
            </section>
          )}
        </div>
        <div className="form-action-bar">
          <div>
            <Icon name="check" size={18} />
            <span>
              {mod.kind
                ? 'مبالغ قبل از ذخیره کنترل می‌شوند.'
                : 'اطلاعات شما پس از ثبت قابل ویرایش است.'}
            </span>
          </div>
          <Link className="btn" href={`/${mod.key}${id ? `/${id}` : ''}`}>
            انصراف
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save size={17} />
            {saving ? 'در حال ذخیره…' : `ذخیره ${mod.singular}`}
          </button>
        </div>
      </form>
    </>
  );
}
function newLine(): Line {
  return {
    id: crypto.randomUUID(),
    title: '',
    productId: '',
    accountId: '',
    quantity: 1,
    price: 0,
    discount: 0,
    tax: 0,
    debit: 0,
    credit: 0,
  };
}
function DocumentLines({ mod, row }: { mod: Module; row: Row }) {
  const { boot, currency } = useApp();
  const journal = mod.kind === 'journal';
  const columns: Column[] = [
    { key: 'index', label: 'ردیف' },
    { key: 'reference', label: journal ? 'حساب' : 'کالا / خدمت' },
    { key: 'title', label: 'شرح' },
    ...(journal
      ? [
          { key: 'debit', label: 'بدهکار', type: 'money' },
          { key: 'credit', label: 'بستانکار', type: 'money' },
        ]
      : [
          { key: 'quantity', label: 'تعداد' },
          { key: 'price', label: 'قیمت واحد', type: 'money' },
          { key: 'discount', label: 'تخفیف ٪' },
          { key: 'tax', label: 'مالیات ٪' },
          { key: 'total', label: 'مبلغ', type: 'money' },
        ]),
  ];
  const rows = ((row.lines || []) as Line[]).map((l, i) => ({
    ...l,
    index: i + 1,
    currency: row.currency || currency,
    reference: String(
      (l as unknown as Record<string, unknown>).productName ||
        boot?.lookups[journal ? 'accounts' : 'products']?.find(
          (p) => p.id === (journal ? l.accountId : l.productId),
        )?.name ||
        '',
    ),
    total:
      (l as unknown as Record<string, unknown>).lineTotal ?? invoiceTotals({ lines: [l] }).total,
  }));
  return (
    <div className="document-lines">
      <DataTable
        columns={columns}
        rows={rows}
        title={`ردیف‌های ${row.code || mod.singular}`}
        defaultPageSize={10}
      />
    </div>
  );
}
function LineEditor({
  mod,
  lines,
  onChange,
}: {
  mod: Module;
  lines: Line[];
  onChange: (l: Line[]) => void;
}) {
  const { boot, fmt, currency } = useApp();
  const journal = mod.kind === 'journal';
  const [filters, setFilters] = useState<Record<string, string>>({});
  useEffect(() => {
    setFilters({});
  }, [lines.length]);
  const change = (i: number, key: string, value: string | number) => {
    const copy = lines.map((l) => ({ ...l }));
    copy[i] = { ...copy[i], [key]: value };
    if (key === 'productId') {
      const p = boot?.lookups.products.find((p) => p.id === value);
      if (p) {
        copy[i].title = String(p.name);
        copy[i].price = number(
          p[mod.key.startsWith('purchase') || mod.key === 'boms' ? 'cost' : 'price'],
        );
        copy[i].tax = mod.key === 'boms' ? 0 : number(boot?.settings.taxRate);
      }
    }
    onChange(copy);
  };
  const keys = journal
    ? ['debit', 'credit']
    : mod.key === 'boms'
      ? ['quantity', 'price']
      : ['quantity', 'price', 'discount', 'tax'];
  const labels: Record<string, string> = {
    quantity: 'تعداد',
    price: 'قیمت واحد',
    discount: 'تخفیف ٪',
    tax: 'مالیات ٪',
    debit: 'بدهکار',
    credit: 'بستانکار',
  };
  const lineText = (l: Line, key: string) =>
    key === 'reference'
      ? String(
          boot?.lookups[journal ? 'accounts' : 'products']?.find(
            (r) => r.id === (journal ? l.accountId : l.productId),
          )?.name || '',
        )
      : key === 'total'
        ? String(invoiceTotals({ lines: [l] }).total)
        : String(l[key as keyof Line] || '');
  const filterKeys = ['reference', 'title', ...keys, ...(!journal ? ['total'] : [])];
  return (
    <div className="table-scroll">
      <table className="line-table">
        <thead>
          <tr>
            <th>#</th>
            <th>{journal ? 'حساب' : 'کالا / خدمت'}</th>
            <th>شرح ردیف</th>
            {keys.map((k) => (
              <th key={k}>{labels[k]}</th>
            ))}
            {!journal && <th>مبلغ نهایی</th>}
            <th />
          </tr>
          <tr className="column-filters">
            <th />
            {filterKeys.map((k) => (
              <th key={k}>
                <div>
                  <input
                    type="search"
                    aria-label={`جست‌وجوی ${k === 'reference' ? 'کالا یا حساب' : k === 'title' ? 'شرح' : k === 'total' ? 'مبلغ نهایی' : labels[k]} در ردیف‌ها`}
                    placeholder="جست‌وجو…"
                    value={filters[k] || ''}
                    onChange={(e) => setFilters({ ...filters, [k]: e.target.value })}
                  />
                </div>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {lines
            .map((l, i) => ({ l, i }))
            .filter(({ l }) =>
              filterKeys.every(
                (k) => !filters[k] || normalize(lineText(l, k)).includes(normalize(filters[k])),
              ),
            )
            .map(({ l, i }) => (
              <tr key={l.id}>
                <td>{fmt(i + 1)}</td>
                <td>
                  <SearchSelect
                    className="input line-product"
                    aria-label={`${journal ? 'حساب' : 'کالا'} ردیف ${i + 1}`}
                    required
                    value={journal ? l.accountId : l.productId}
                    onChange={(e) => change(i, journal ? 'accountId' : 'productId', e.target.value)}
                  >
                    <option value="">انتخاب {journal ? 'حساب' : 'کالا'}</option>
                    {boot?.lookups[journal ? 'accounts' : 'products']
                      ?.filter(
                        (r) =>
                          r.status !== 'غیرفعال' || r.id === (journal ? l.accountId : l.productId),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {String(p.code)} · {String(p.name)}
                        </option>
                      ))}
                  </SearchSelect>
                </td>
                <td>
                  <input
                    className="input line-description"
                    aria-label={`شرح ردیف ${i + 1}`}
                    value={l.title}
                    onChange={(e) => change(i, 'title', e.target.value)}
                  />
                </td>
                {keys.map((k) => (
                  <td key={k}>
                    <input
                      className={`input ${['price', 'debit', 'credit'].includes(k) ? 'line-money' : 'line-number'}`}
                      aria-label={`${labels[k]} ردیف ${i + 1}`}
                      inputMode="decimal"
                      value={l[k as keyof Line] ?? 0}
                      onChange={(e) => {
                        const n = normalize(e.target.value);
                        if (/^\d*\.?\d*$/.test(n)) change(i, k, n === '' ? '' : n);
                      }}
                    />
                  </td>
                ))}
                {!journal && (
                  <td className="line-total">{fmt(invoiceTotals({ lines: [l] }).total)}</td>
                )}
                <td>
                  <button
                    type="button"
                    className="icon-button danger-text"
                    disabled={lines.length === 1}
                    aria-label={`حذف ردیف ${i + 1}`}
                    onClick={() => onChange(lines.filter((_, n) => n !== i))}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export function EntityDetail({ mod, id }: { mod: Module; id: string }) {
  const { api, boot, fmt, date, notify, reload, canWrite, currency } = useApp();
  const router = useRouter();
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseDate, setReverseDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancel = false;
    api<Row>(`${mod.key}/${id}`)
      .then((r) => {
        if (!cancel) setRow(r);
      })
      .catch((e) => {
        if (!cancel) setError(e.message);
      });
    return () => {
      cancel = true;
    };
  }, [api, id, mod.key]);
  async function perform(action: string) {
    setBusy(true);
    try {
      if (action === 'delete') {
        await api(`${mod.key}/${id}`, { method: 'DELETE' });
        notify('رکورد حذف شد.');
        await reload();
        router.push(`/${mod.key}`);
      } else if (action === 'convert') {
        const created = await api<Row>(`${mod.key}/${id}/convert`, {
          method: 'POST',
          body: JSON.stringify({ version: row?.version }),
        });
        notify('فاکتور فروش از پیش‌فاکتور ایجاد شد.');
        await reload();
        router.push(`/sales/${created.id}`);
      } else if (action === 'reverse') {
        const result = await api<Row>(`${mod.key}/${id}/reverse`, {
          method: 'POST',
          body: JSON.stringify({ version: row?.version, reason: reverseReason, date: reverseDate }),
        });
        setRow(result);
        await reload();
        notify('سند برگشتی ثبت شد.');
      } else {
        const result = await api<Row>(`${mod.key}/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: action, version: row?.version }),
        });
        setRow(result);
        notify('وضعیت با موفقیت تغییر کرد.');
        await reload();
      }
      setConfirm(null);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <div className="empty-state">
        <h2>{error}</h2>
        <Link className="btn" href={`/${mod.key}`}>
          بازگشت
        </Link>
      </div>
    );
  if (!row) return <Loading />;
  const company =
    (row.companySnapshot as unknown as Row) || boot?.companies.find((c) => c.id === row.companyId);
  const person =
    (row.partySnapshot as unknown as Row) ||
    boot?.lookups.people?.find((p) => p.id === row.personId);
  const total = (row.totals as unknown as ReturnType<typeof invoiceTotals>) || invoiceTotals(row);
  const isInvoice = mod.kind === 'invoice';
  const transactions = ['sales', 'purchases'].includes(mod.key)
    ? boot?.lookups[mod.key === 'sales' ? 'receipts' : 'payments']?.filter(
        (p) => p.invoiceId === row.id,
      ) || []
    : [];
  return (
    <>
      <div className="no-print">
        <PageHeading
          back={`/${mod.key}`}
          eyebrow={mod.group}
          title={`${mod.singular} ${row.code || row.name || ''}`}
          description={`تاریخ ایجاد: ${date(row.createdAt)} · ${String(company?.name || '')}`}
        >
          <button className="btn" onClick={() => window.print()}>
            <Printer size={17} /> چاپ / PDF
          </button>
          {canWrite && !row.postedAt && (
            <Link className="btn" href={`/${mod.key}/${id}/edit`}>
              <Pencil size={16} /> ویرایش
            </Link>
          )}
          {canWrite && mod.key === 'quotes' && (
            <button className="btn btn-primary" disabled={busy} onClick={() => perform('convert')}>
              <Copy size={16} /> تبدیل به فاکتور فروش
            </button>
          )}
        </PageHeading>
        <div className="detail-status-bar">
          <div>
            <Badge value={row.status} />
            <span className="muted">
              {mod.kind === 'journal'
                ? `مبنای ثبت: ${currency}`
                : String(row.currency || 'اطلاعات ثبت‌شده')}
            </span>
          </div>
          {canWrite && (
            <div>
              {mod.status && !row.postedAt && (
                <label className="status-picker">
                  <span>تغییر وضعیت</span>
                  <SearchSelect
                    aria-label="تغییر وضعیت سند"
                    disabled={busy}
                    value={String(row.status || '')}
                    onChange={(e) => {
                      if (e.target.value !== row.status) setConfirm(e.target.value);
                    }}
                  >
                    {mod.status.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SearchSelect>
                </label>
              )}
              {!row.postedAt && (
                <button
                  className="icon-button danger-text"
                  aria-label="حذف رکورد"
                  onClick={() => setConfirm('delete')}
                >
                  <Trash2 size={18} />
                </button>
              )}
              {row.postedAt && !row.reversedAt && (
                <button className="btn" disabled={busy} onClick={() => setConfirm('reverse')}>
                  ثبت سند برگشتی
                </button>
              )}
              {mod.key === 'checks' &&
                row.postedAt &&
                !row.reversedAt &&
                row.status === 'در جریان' && (
                  <button className="btn btn-primary" onClick={() => setConfirm('وصول شده')}>
                    ثبت وصول چک
                  </button>
                )}
              {mod.key === 'payroll' &&
                row.postedAt &&
                !row.reversedAt &&
                row.status !== 'پرداخت شده' && (
                  <button className="btn btn-primary" onClick={() => setConfirm('پرداخت شده')}>
                    ثبت پرداخت حقوق
                  </button>
                )}
            </div>
          )}
        </div>
      </div>
      <section className="panel document-panel print-document">
        <div className="document-heading">
          <div>
            <span className="document-brand">
              تراز<span>.</span>
            </span>
            <h2>{String(company?.name || '')}</h2>
            <p>{String(company?.address || boot?.settings.address || '')}</p>
            <small>
              شناسه ملی: {String(company?.nationalId || '—')} · تلفن:{' '}
              {String(company?.phone || boot?.settings.phone || '—')}
            </small>
          </div>
          <div className="document-number">
            <span>{mod.singular}</span>
            <strong>{String(row.code || row.name || '')}</strong>
            <small>{date(row.date || row.createdAt)}</small>
          </div>
        </div>
        {person && (
          <div className="invoice-person">
            <div>
              <small>طرف حساب</small>
              <strong>{String(person.name)}</strong>
              <span>{String(person.address || '')}</span>
            </div>
            <div>
              <span>تلفن: {String(person.phone || '—')}</span>
              <span>شناسه ملی: {String(person.nationalId || '—')}</span>
              <span>سررسید: {date(row.dueDate)}</span>
            </div>
          </div>
        )}
        <div className="detail-fields">
          {mod.fields
            .filter(
              (f) =>
                !f.hidden &&
                !['notes', 'address'].includes(f.key) &&
                (!isInvoice || !['personId', 'date', 'code', 'discount'].includes(f.key)),
            )
            .map((f) => (
              <div key={f.key}>
                <small>{f.label}</small>
                <strong>
                  {f.ref
                    ? String(
                        boot?.lookups[f.ref]?.find((r) => r.id === row[f.key])?.name ||
                          boot?.lookups[f.ref]?.find((r) => r.id === row[f.key])?.code ||
                          '—',
                      )
                    : f.type === 'date'
                      ? date(row[f.key])
                      : ['money', 'number'].includes(f.type || '')
                        ? fmt(row[f.key]) +
                          (f.type === 'money' ? ` ${String(row.currency || currency)}` : '')
                        : String(row[f.key] || '—')}
                </strong>
              </div>
            ))}
        </div>
        {mod.kind && <DocumentLines mod={mod} row={row} />}
        <div className="document-bottom">
          <div>
            <h3>توضیحات</h3>
            <p>{String(row.notes || row.address || boot?.settings.invoiceNote || '—')}</p>
            <div className="document-signatures">
              <span>مهر و امضای صادرکننده</span>
              <span>مهر و امضای دریافت‌کننده</span>
            </div>
          </div>
          {isInvoice ? (
            <div className="document-totals">
              <div>
                <span>جمع اقلام</span>
                <strong>{fmt(total.subtotal)}</strong>
              </div>
              <div>
                <span>تخفیف</span>
                <strong>{fmt(total.discount)}</strong>
              </div>
              <div>
                <span>مالیات و عوارض</span>
                <strong>{fmt(total.tax)}</strong>
              </div>
              <div className="grand-total">
                <span>مبلغ نهایی</span>
                <strong>
                  {fmt(total.total)}
                  <small>{String(row.currency || currency)}</small>
                </strong>
              </div>
              {row.remaining !== undefined && (
                <div>
                  <span>مانده قابل تسویه</span>
                  <strong>{fmt(row.remaining)}</strong>
                </div>
              )}
            </div>
          ) : row.total !== undefined ||
            row.bookValue !== undefined ||
            row.balance !== undefined ||
            row.amount !== undefined ? (
            <div className="document-totals">
              <div className="grand-total">
                <span>
                  {mod.key === 'payroll'
                    ? 'خالص پرداختنی'
                    : mod.key === 'assets'
                      ? 'ارزش دفتری'
                      : mod.key === 'banks'
                        ? 'مانده'
                        : 'مبلغ'}
                </span>
                <strong>
                  {fmt(row.total ?? row.bookValue ?? row.balance ?? row.amount ?? 0)}
                  <small>{String(row.currency || currency)}</small>
                </strong>
              </div>
            </div>
          ) : null}
        </div>
        <div className="document-footnote">صادرشده در تراز · محیط آزمایشی</div>
      </section>
      {['sales', 'purchases'].includes(mod.key) && (
        <section className="panel related-panel no-print">
          <div className="panel-heading">
            <h2>تاریخچه تسویه</h2>
            {canWrite && (
              <Link
                href={`/${mod.key === 'sales' ? 'receipts' : 'payments'}/new?invoiceId=${row.id}`}
                className="btn btn-small"
              >
                <Plus size={15} /> ثبت {mod.key === 'sales' ? 'دریافت' : 'پرداخت'}
              </Link>
            )}
          </div>
          <DataTable
            rows={transactions}
            columns={[
              { key: 'code', label: 'شماره تراکنش' },
              { key: 'date', label: 'تاریخ', type: 'date' },
              { key: 'amount', label: 'مبلغ', type: 'money' },
              { key: 'method', label: 'روش' },
              { key: 'status', label: 'وضعیت' },
            ]}
            title="تاریخچه تسویه"
            onView={(r) => router.push(`/${mod.key === 'sales' ? 'receipts' : 'payments'}/${r.id}`)}
          />
        </section>
      )}
      {!['companies', 'users'].includes(mod.key) && (
        <Attachments recordId={row.id} posted={!!row.postedAt} />
      )}
      {confirm === 'reverse' && (
        <section className="panel form-panel no-print">
          <h2>ثبت سند برگشتی</h2>
          <p>سند اولیه حفظ می‌شود و یک ثبت معکوس با تاریخ و دلیل شما ایجاد می‌شود.</p>
          <label className="field">
            <span>دلیل برگشت</span>
            <textarea
              aria-label="دلیل برگشت"
              className="input"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
            />
          </label>
          <label className="field">
            <span>تاریخ برگشت</span>
            <DatePicker label="تاریخ برگشت" value={reverseDate} onChange={setReverseDate} />
          </label>
          <div className="saas-form-actions">
            <button className="btn" onClick={() => setConfirm(null)}>
              انصراف
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || reverseReason.trim().length < 3}
              onClick={() => perform('reverse')}
            >
              ثبت برگشت
            </button>
          </div>
        </section>
      )}
      {confirm && confirm !== 'reverse' && (
        <Confirm
          title={confirm === 'delete' ? `حذف ${mod.singular}` : 'تغییر وضعیت'}
          description={
            confirm === 'delete'
              ? 'این رکورد حذف می‌شود. رکوردهای تأییدشده یا دارای وابستگی، ابتدا باید اصلاح شوند.'
              : `وضعیت سند به «${confirm}» تغییر می‌کند. مانده‌ها و گزارش‌های مرتبط دوباره محاسبه خواهند شد.`
          }
          onClose={() => setConfirm(null)}
          onConfirm={() => perform(confirm)}
          busy={busy}
        />
      )}
    </>
  );
}
