'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpLeft, Printer, CalendarDays, RefreshCw, ArrowRight, Search } from 'lucide-react';
import { reports } from '@/lib/modules';
import { useApp } from './provider';
import { Icon } from './icons';
import { PageHeading, Loading } from './ui';
import { DataTable, type Column, type TableRow } from './data-table';
import { DatePicker } from './date-picker';
export function ReportsIndex() {
  const [q, setQ] = useState('');
  return (
    <>
      <PageHeading
        eyebrow="از عددها به تصمیم‌ها"
        title="گزارش‌های مالی"
        description="دیدی دقیق از عملکرد، جریان نقد و وضعیت مالی کسب‌وکارتان."
      />
      <div className="reports-banner">
        <div>
          <span className="eyebrow">تصویر بزرگ‌تر را ببینید</span>
          <h2>
            تصمیم‌های بهتر،
            <br />
            از حساب‌های روشن شروع می‌شوند.
          </h2>
          <p>گزارش‌ها به‌صورت زنده از اسناد تأییدشده ساخته می‌شوند.</p>
        </div>
        <div className="report-art" aria-hidden="true">
          <div className="art-axis" />
          <span style={{ height: '40%' }} />
          <span style={{ height: '68%' }} />
          <span style={{ height: '51%' }} />
          <span style={{ height: '86%' }} />
          <span style={{ height: '100%' }} />
          <i>↗</i>
        </div>
      </div>
      <div className="reports-section-title">
        <h2>کتابخانه گزارش‌ها</h2>
        <div className="table-search">
          <Search size={16} />
          <input
            aria-label="جست‌وجوی گزارش"
            placeholder="نام گزارش را جست‌وجو کنید…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="reports-grid">
        {reports
          .filter((r) => r.title.includes(q))
          .map((r, i) => (
            <Link key={r.key} href={`/reports/${r.key}`} className="report-card">
              <div className="report-card-top">
                <span className={`report-card-icon report-tone-${i % 3}`}>
                  <Icon name={r.icon} size={23} />
                </span>
                <ArrowUpLeft size={20} />
              </div>
              <h2>{r.title}</h2>
              <p>{r.description}</p>
              <span className="report-card-link">
                مشاهده گزارش <ArrowUpLeft size={14} />
              </span>
            </Link>
          ))}
      </div>
    </>
  );
}
type Result = { rows: TableRow[]; summary: { label: string; value: number; unit?: string }[] };
export function ReportView({ reportKey }: { reportKey: string }) {
  const { api, boot, fmt } = useApp();
  const definition = reports.find((r) => r.key === reportKey)!;
  const [result, setResult] = useState<Result | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [account, setAccount] = useState('');
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (reportKey === 'ledger' && !account && boot?.lookups.accounts.length)
      setAccount(boot.lookups.accounts[0].id);
  }, [reportKey, boot, account]);
  useEffect(() => {
    let cancelled = false;
    if (from && to && from > to) {
      setError('تاریخ شروع باید پیش از پایان باشد.');
      return;
    }
    setError('');
    const params = new URLSearchParams({ from, to, accountId: account });
    api<Result>(`reports/${reportKey}?${params}`)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api, reportKey, from, to, account, revision]);
  const fields: Record<string, Column[]> = {
    'profit-loss': [
      { key: 'code', label: 'کد حساب' },
      { key: 'name', label: 'عنوان حساب' },
      { key: 'type', label: 'گروه' },
      { key: 'amount', label: 'مبلغ', type: 'money' },
    ],
    'balance-sheet': [
      { key: 'code', label: 'کد حساب' },
      { key: 'name', label: 'عنوان حساب' },
      { key: 'type', label: 'گروه' },
      { key: 'amount', label: 'مانده', type: 'money' },
    ],
    'trial-balance': [
      { key: 'code', label: 'کد حساب' },
      { key: 'name', label: 'عنوان حساب' },
      { key: 'debit', label: 'گردش بدهکار', type: 'money' },
      { key: 'credit', label: 'گردش بستانکار', type: 'money' },
      { key: 'debitBalance', label: 'مانده بدهکار', type: 'money' },
      { key: 'creditBalance', label: 'مانده بستانکار', type: 'money' },
    ],
    journal: [
      { key: 'code', label: 'شماره سند' },
      { key: 'date', label: 'تاریخ', type: 'date' },
      { key: 'accountCode', label: 'کد حساب' },
      { key: 'account', label: 'حساب' },
      { key: 'description', label: 'شرح' },
      { key: 'debit', label: 'بدهکار', type: 'money' },
      { key: 'credit', label: 'بستانکار', type: 'money' },
    ],
    ledger: [
      { key: 'code', label: 'شماره سند' },
      { key: 'date', label: 'تاریخ', type: 'date' },
      { key: 'description', label: 'شرح' },
      { key: 'debit', label: 'بدهکار', type: 'money' },
      { key: 'credit', label: 'بستانکار', type: 'money' },
      { key: 'balance', label: 'مانده تجمعی', type: 'money' },
    ],
    receivables: [
      { key: 'code', label: 'کد شخص' },
      { key: 'name', label: 'طرف حساب' },
      { key: 'phone', label: 'تلفن' },
      { key: 'debit', label: 'مانده بدهکار', type: 'money' },
      { key: 'credit', label: 'مانده بستانکار', type: 'money' },
    ],
    inventory: [
      { key: 'code', label: 'کد کالا' },
      { key: 'name', label: 'نام کالا' },
      { key: 'warehouse', label: 'انبار' },
      {
        key: 'quantity',
        label: 'موجودی',
        type: 'number',
        render: (r) => (
          <span
            className={
              Number(r.quantity) < Number(r.minStock) ? 'danger-text font-medium' : 'font-medium'
            }
          >
            {fmt(r.quantity)}
          </span>
        ),
      },
      { key: 'unit', label: 'واحد' },
      { key: 'minStock', label: 'حداقل موجودی', type: 'number' },
      { key: 'value', label: 'ارزش موجودی', type: 'money' },
    ],
    cashflow: [
      { key: 'code', label: 'شماره سند' },
      { key: 'date', label: 'تاریخ', type: 'date' },
      { key: 'description', label: 'شرح' },
      { key: 'debit', label: 'ورودی وجه', type: 'money' },
      { key: 'credit', label: 'خروجی وجه', type: 'money' },
      { key: 'amount', label: 'خالص', type: 'money' },
    ],
    tax: [
      { key: 'code', label: 'شماره فاکتور' },
      { key: 'date', label: 'تاریخ', type: 'date' },
      { key: 'name', label: 'طرف حساب' },
      { key: 'type', label: 'نوع سند' },
      { key: 'amount', label: 'مبلغ مشمول', type: 'money' },
      { key: 'tax', label: 'مالیات', type: 'money' },
    ],
    'project-profit': [
      { key: 'code', label: 'کد پروژه' },
      { key: 'name', label: 'نام پروژه' },
      { key: 'budget', label: 'بودجه', type: 'money' },
      { key: 'cost', label: 'هزینه', type: 'money' },
      { key: 'income', label: 'درآمد', type: 'money' },
      { key: 'profit', label: 'سود', type: 'money' },
      { key: 'remaining', label: 'بودجه باقیمانده', type: 'money' },
      { key: 'progress', label: 'پیشرفت' },
    ],
  };
  return (
    <>
      <PageHeading
        back="/reports"
        eyebrow="گزارش‌های مالی"
        title={definition.title}
        description={definition.description}
      >
        <button className="btn" onClick={() => setRevision((v) => v + 1)}>
          <RefreshCw size={16} /> به‌روزرسانی
        </button>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={16} /> چاپ گزارش
        </button>
      </PageHeading>
      <div className="panel report-filters no-print">
        <span>
          <CalendarDays size={18} /> محدوده گزارش
        </span>
        {!['balance-sheet', 'inventory', 'receivables'].includes(reportKey) && (
          <label>
            <span>از تاریخ</span>
            <DatePicker value={from} onChange={setFrom} label="گزارش از تاریخ" />
          </label>
        )}
        <label>
          <span>تا تاریخ</span>
          <DatePicker value={to} onChange={setTo} label="گزارش تا تاریخ" />
        </label>
        {reportKey === 'ledger' && (
          <label className="ledger-account">
            <span>حساب</span>
            <select
              className="input"
              aria-label="حساب دفتر کل"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            >
              {boot?.lookups.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {String(a.code)} · {String(a.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="text-button"
          onClick={() => {
            setFrom('');
            setTo('');
          }}
        >
          کل دوره مالی
        </button>
        <span className="report-base-unit">مبنای دفاتر: تومان</span>
      </div>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {result ? (
        <>
          <div className="report-summary">
            {result.summary.map((s, i) => (
              <div
                key={s.label}
                className={i === result.summary.length - 1 ? 'summary-highlight' : ''}
              >
                <small>{s.label}</small>
                <strong>
                  {fmt(s.value)}
                  <span>{s.unit || 'تومان'}</span>
                </strong>
              </div>
            ))}
          </div>
          <div className="panel">
            <DataTable
              key={reportKey}
              title={definition.title}
              rows={result.rows}
              columns={fields[reportKey]}
              defaultPageSize={10}
            />
          </div>
          <p className="report-note">
            <Icon name="check" size={15} /> گزارش بر اساس اطلاعات شرکت، شعبه و سال مالی انتخاب‌شده
            تهیه شده است. مبالغ ارزی با نرخ ثبت‌شده در سند به تومان تبدیل می‌شوند.
          </p>
        </>
      ) : (
        <Loading />
      )}
    </>
  );
}
