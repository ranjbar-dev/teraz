'use client';
import { useMemo, useState } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { SearchSelect } from './search-select';
import { normalizeSearch } from '@/lib/search';
export type Item = Record<string, any>;
export const format = (v: unknown) =>
  new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 }).format(Number(v) || 0);
export const day = (v: unknown) =>
  v ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(String(v))) : '—';
export const stateLabel = (v: string) =>
  (
    ({
      ACTIVE: 'فعال',
      TRIAL: 'آزمایشی',
      SUSPENDED: 'تعلیق',
      CANCELLED: 'لغو',
      PENDING: 'در صف',
      PROCESSING: 'در حال پردازش',
      RECEIVED: 'دریافت‌شده؛ در انتظار نتیجه',
      SUCCESS: 'پذیرفته‌شده',
      FAILED: 'ناموفق',
      VERIFIED: 'تأیید پرداخت',
      REQUEST_FAILED: 'خطای درگاه',
      DRY_RUN: 'پیش‌نمایش محلی',
      LOCAL_SUCCESS: 'موفق در شبیه‌ساز محلی',
      LOCAL_FAILED: 'رد در شبیه‌ساز محلی',
      RETRY: 'تلاش مجدد',
      REVIEW_REQUIRED: 'نیازمند بررسی',
    }) as Item
  )[v] || v;
export async function request<T = Item>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const res = await fetch('/api/' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(data ? { body: JSON.stringify(data) } : {}),
    cache: 'no-store',
  });
  const value = await res.json();
  if (!res.ok) {
    if (res.status === 401) location.href = '/login';
    throw new Error(value.error || 'ارتباط با سرور برقرار نشد.');
  }
  return value;
}
export function SmartTable({
  rows,
  columns,
  action,
  title,
}: {
  rows: Item[];
  columns: {
    key: string;
    label: string;
    render?: (row: Item) => React.ReactNode;
    text?: (row: Item) => string;
  }[];
  action?: (row: Item) => React.ReactNode;
  title: string;
}) {
  const [search, setSearch] = useState(''),
    [filters, setFilters] = useState<Item>({}),
    [page, setPage] = useState(1);
  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          columns.every(
            (c) =>
              !filters[c.key] ||
              normalizeSearch(c.text?.(r) ?? String(r[c.key] ?? '')).includes(
                normalizeSearch(filters[c.key]),
              ),
          ) &&
          (!search ||
            columns.some((c) =>
              normalizeSearch(c.text?.(r) ?? String(r[c.key] ?? '')).includes(
                normalizeSearch(search),
              ),
            )),
      ),
    [rows, columns, filters, search],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    current = Math.min(page, pages);
  return (
    <section className="panel saas-table">
      <div className="panel-heading">
        <h2>{title}</h2>
        <div className="table-search">
          <Search size={16} />
          <input
            aria-label={`جست‌وجو در ${title}`}
            value={search}
            placeholder="جست‌وجو در همهٔ ستون‌ها…"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      <div className="saas-table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              {action && <th>عملیات</th>}
            </tr>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>
                  <input
                    aria-label={`جست‌وجوی ${c.label}`}
                    placeholder="جست‌وجو…"
                    value={filters[c.key] || ''}
                    onChange={(e) => {
                      setFilters({ ...filters, [c.key]: e.target.value });
                      setPage(1);
                    }}
                  />
                </th>
              ))}
              {action && <th />}
            </tr>
          </thead>
          <tbody>
            {filtered.slice((current - 1) * 10, current * 10).map((r, i) => (
              <tr key={r.id || i}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render?.(r) ?? String(r[c.key] ?? '—')}</td>
                ))}
                {action && <td>{action(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && (
          <div className="empty-state">
            <strong>موردی برای نمایش نیست</strong>
            <p>اطلاعات جدید اضافه کنید یا فیلترها را تغییر دهید.</p>
          </div>
        )}
      </div>
      <div className="saas-pagination">
        <span>
          {format(filtered.length)} مورد · صفحهٔ {format(current)} از {format(pages)}
        </span>
        <div>
          <button
            className="icon-button"
            aria-label="صفحه قبل"
            disabled={current === 1}
            onClick={() => setPage(current - 1)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="صفحه بعد"
            disabled={current === pages}
            onClick={() => setPage(current + 1)}
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
export function Input({
  label,
  name,
  value,
  onChange,
  type = 'text',
  options,
  required = true,
  hint,
}: {
  label: string;
  name: string;
  value: any;
  onChange: (name: string, value: any) => void;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <b> *</b>}
      </span>
      {options ? (
        <SearchSelect
          className="input"
          aria-label={label}
          required={required}
          value={String(value ?? '')}
          onChange={(e) => onChange(name, e.target.value)}
        >
          <option value="">انتخاب کنید</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </SearchSelect>
      ) : type === 'textarea' ? (
        <textarea
          className="input"
          rows={4}
          aria-label={label}
          required={required}
          value={String(value ?? '')}
          onChange={(e) => onChange(name, e.target.value)}
        />
      ) : (
        <input
          className="input"
          type={type}
          aria-label={label}
          required={required}
          min={type === 'number' ? 0 : undefined}
          step={type === 'number' ? 'any' : undefined}
          value={String(value ?? '')}
          onChange={(e) => onChange(name, e.target.value)}
          dir={['email', 'password', 'number', 'date'].includes(type) ? 'ltr' : undefined}
        />
      )}
      {hint && <small className="field-help">{hint}</small>}
    </label>
  );
}
