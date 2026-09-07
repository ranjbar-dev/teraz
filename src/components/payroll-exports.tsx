'use client';
import { useEffect, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';
import { useApp } from './provider';
import { PageHeading } from './ui';
import { DataTable, Column } from './data-table';
import { SearchSelect } from './search-select';
import { Item } from './saas-shared';
const months = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];
export function PayrollExports() {
  const { api, fmt } = useApp();
  const [data, setData] = useState<Item | null>(null),
    [error, setError] = useState(''),
    [month, setMonth] = useState(''),
    [tab, setTab] = useState('payroll'),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    api<Item>('payroll-exports?' + new URLSearchParams({ month }))
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setError('');
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [api, month, revision]);
  const title =
    tab === 'insurance'
      ? 'لیست آزمایشی بیمه'
      : tab === 'tax'
        ? 'لیست آزمایشی مالیات حقوق'
        : 'خلاصهٔ آزمایشی حقوق';
  const columns: Column[] = [
    { key: 'code', label: 'شماره فیش' },
    { key: 'name', label: 'نام کارمند' },
    { key: 'nationalId', label: 'کد ملی' },
    { key: 'month', label: 'ماه' },
    { key: 'date', label: 'تاریخ', type: 'date' },
    { key: 'days', label: 'روز کارکرد' },
    ...(tab === 'insurance'
      ? [
          { key: 'insuranceNumber', label: 'شماره بیمه' },
          { key: 'insuranceBaseIRR', label: 'دستمزد مشمول بیمه', type: 'money' },
          { key: 'employeeInsuranceIRR', label: 'سهم کارمند', type: 'money' },
          { key: 'employerInsuranceIRR', label: 'سهم کارفرما', type: 'money' },
        ]
      : tab === 'tax'
        ? [
            { key: 'grossIRR', label: 'ناخالص', type: 'money' },
            { key: 'taxableBaseIRR', label: 'پایهٔ مشمول مالیات', type: 'money' },
            { key: 'taxIRR', label: 'مالیات', type: 'money' },
          ]
        : [
            { key: 'baseIRR', label: 'پایه', type: 'money' },
            { key: 'benefitsIRR', label: 'مزایا و اضافه‌کاری', type: 'money' },
            { key: 'grossIRR', label: 'ناخالص', type: 'money' },
            { key: 'employeeInsuranceIRR', label: 'بیمه کارمند', type: 'money' },
            { key: 'taxIRR', label: 'مالیات', type: 'money' },
            { key: 'deductionsIRR', label: 'کسورات', type: 'money' },
            { key: 'netIRR', label: 'خالص', type: 'money' },
          ]),
    { key: 'ruleName', label: 'نسخهٔ قواعد', hidden: true },
    { key: 'ruleSource', label: 'مرجع قواعد', hidden: true },
    { key: 'mode', label: 'نوع خروجی', hidden: true },
  ];
  return (
    <>
      <PageHeading
        eyebrow="حقوق و دستمزد"
        title="خروجی‌های آزمایشی حقوق"
        description="مبالغ ریالی از محاسبات ذخیره‌شدهٔ فیش‌های قطعی؛ اسناد برگشت‌خورده کنار گذاشته می‌شوند."
      >
        <button className="btn" onClick={() => setRevision((r) => r + 1)}>
          <RefreshCw size={16} />
          به‌روزرسانی
        </button>
        <button className="btn" onClick={() => window.print()}>
          <Printer size={16} />
          چاپ
        </button>
      </PageHeading>
      <div className="success-note">
        این خروجی‌ها برای آزمایش و تطبیق داخلی هستند و قالب قابل ارسال به سامانه‌های رسمی نیستند.
      </div>
      <section className="panel form-panel">
        <div className="form-grid">
          <label className="field">
            <span>ماه کارکرد</span>
            <SearchSelect value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="">همهٔ ماه‌های دوره</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </SearchSelect>
          </label>
        </div>
        {data && (
          <div className="payroll-export-summary">
            <span>{fmt(data.summary.count)} فیش قطعی</span>
            <span>خالص: {fmt(data.summary.netIRR)} ریال</span>
            <span>بیمه: {fmt(data.summary.insuranceIRR)} ریال</span>
            <span>مالیات: {fmt(data.summary.taxIRR)} ریال</span>
          </div>
        )}
      </section>
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <section className="panel">
        <div className="status-tabs">
          {[
            ['payroll', 'خلاصه حقوق'],
            ['insurance', 'لیست بیمه'],
            ['tax', 'لیست مالیات'],
          ].map(([key, label]) => (
            <button key={key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
        {data ? (
          <DataTable key={tab} rows={data.rows} columns={columns} title={title} />
        ) : (
          <div className="loading-screen">
            <div className="spinner" />
          </div>
        )}
      </section>
    </>
  );
}
