'use client';
import { SearchSelect } from './search-select';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Search,
  SlidersHorizontal,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Inbox,
} from 'lucide-react';
import { useApp } from './provider';
import { Badge } from './ui';
import { normalizeSearch } from '@/lib/search';
export type TableRow = { id: string; [key: string]: unknown };
export type Column = {
  key: string;
  label: string;
  type?: string;
  hidden?: boolean;
  render?: (row: TableRow) => React.ReactNode;
  text?: (row: TableRow) => string;
};
export const normalize = normalizeSearch;
export type TableQuery = { q: string; filters: string; sort: string; page: number; limit: number };
export type TableResult = { rows: TableRow[]; totalCount: number };
export function DataTable({
  rows: suppliedRows,
  columns,
  title = 'اطلاعات',
  onView,
  actions,
  defaultPageSize = 8,
  toolbar,
  emptyAction,
  load,
}: {
  rows: TableRow[];
  columns: Column[];
  title?: string;
  onView?: (row: TableRow) => void;
  actions?: (row: TableRow) => React.ReactNode;
  defaultPageSize?: number;
  toolbar?: React.ReactNode;
  emptyAction?: React.ReactNode;
  load?: (q: TableQuery) => Promise<TableResult>;
}) {
  const { fmt, date, notify, currency } = useApp();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState({ key: '', direction: 1 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [showColumns, setShowColumns] = useState(false);
  const [visible, setVisible] = useState(columns.filter((c) => !c.hidden).map((c) => c.key));
  const [selected, setSelected] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [remote, setRemote] = useState<TableResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [printRows, setPrintRows] = useState<TableRow[] | null>(null);
  const rows = load ? remote?.rows || suppliedRows : suppliedRows;
  const tableQuery: TableQuery = {
    q: query,
    filters: JSON.stringify(filters),
    sort: sort.key ? (sort.direction < 0 ? '-' : '') + sort.key : '',
    page,
    limit: pageSize,
  };
  const queryKey = JSON.stringify(tableQuery);
  useEffect(() => {
    if (!load) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      load(JSON.parse(queryKey))
        .then((result) => {
          if (!cancelled) {
            setRemote(result);
            setLoadError('');
          }
        })
        .catch((e) => {
          if (!cancelled) setLoadError(e.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load, queryKey]);
  const columnMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSelected((current) => {
      const next = current.filter((id) => rows.some((row) => row.id === id));
      return next.length === current.length ? current : next;
    });
  }, [rows]);
  useEffect(() => {
    if (!showColumns) return;
    const outside = (event: PointerEvent) => {
      if (!columnMenu.current?.contains(event.target as Node)) setShowColumns(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowColumns(false);
        columnMenu.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
    };
  }, [showColumns]);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => {
      setPrinting(false);
      setPrintRows(null);
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  const display = (r: TableRow, c: Column): string =>
    c.text
      ? c.text(r)
      : c.type === 'date'
        ? date(r[c.key])
        : typeof r[c.key] === 'number'
          ? fmt(r[c.key])
          : String(r[c.key] ?? '');
  const filtered = useMemo(
    () =>
      load
        ? rows
        : rows
            .filter(
              (r) =>
                (!query ||
                  columns.some(
                    (c) =>
                      normalize(display(r, c)).includes(normalize(query)) ||
                      normalize(r[c.key]).includes(normalize(query)),
                  )) &&
                columns.every(
                  (c) =>
                    !filters[c.key] ||
                    normalize(display(r, c)).includes(normalize(filters[c.key])) ||
                    normalize(r[c.key]).includes(normalize(filters[c.key])),
                ),
            )
            .sort((a, b) => {
              if (!sort.key) return 0;
              const col = columns.find((c) => c.key === sort.key)!;
              return (
                (typeof a[sort.key] === 'number' && typeof b[sort.key] === 'number'
                  ? Number(a[sort.key]) - Number(b[sort.key])
                  : display(a, col).localeCompare(display(b, col), 'fa', { numeric: true })) *
                sort.direction
              );
            }),
    [rows, columns, query, filters, sort, date, fmt, load],
  );
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [query, filters, pageSize]);
  const totalCount = load ? remote?.totalCount || 0 : filtered.length;
  const pages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, pages);
  const pageRows =
    printing && printRows
      ? printRows
      : load
        ? rows
        : printing
          ? filtered
          : filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const cols = columns.filter((c) => visible.includes(c.key));
  async function allResults() {
    if (!load) return filtered;
    const first = await load({ ...tableQuery, page: 1, limit: 100 });
    const result = [...first.rows];
    for (let page = 2; page <= Math.ceil(first.totalCount / 100); page++)
      result.push(...(await load({ ...tableQuery, page, limit: 100 })).rows);
    return result;
  }
  async function exportFile() {
    setExporting(true);
    try {
      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(title.slice(0, 31).replace(/[\\/*?:[\]]/g, ''), {
        views: [{ rightToLeft: true }],
      });
      sheet.columns = cols.map((c) => ({ header: c.label, key: c.key, width: 24 }));
      const list = selected.length
        ? filtered.filter((r) => selected.includes(r.id))
        : await allResults();
      list.forEach((r) =>
        sheet.addRow(
          Object.fromEntries(
            cols.map((c) => [c.key, typeof r[c.key] === 'number' ? r[c.key] : display(r, c)]),
          ),
        ),
      );
      sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF187457' } };
      sheet.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(
        new Blob([buffer as ArrayBuffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      notify(`خروجی ${fmt(list.length)} ردیف آماده شد.`);
    } catch {
      notify('ساخت خروجی با خطا مواجه شد.', true);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="data-table-wrap">
      <div className="table-toolbar">
        <div className="table-search">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جست‌وجو در تمام اطلاعات…"
            aria-label={`جست‌وجو در ${title}`}
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="پاک کردن جست‌وجو">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="table-tools">
          {load && (
            <button
              className="btn btn-small"
              disabled={loading || exporting || !totalCount}
              onClick={async () => {
                setExporting(true);
                try {
                  const result = await allResults();
                  flushSync(() => {
                    setPrintRows(result);
                    setPrinting(true);
                  });
                  window.print();
                } catch {
                  notify('آماده‌کردن چاپ ناموفق بود.', true);
                } finally {
                  setExporting(false);
                }
              }}
            >
              چاپ همهٔ نتایج
            </button>
          )}
          {toolbar}
          {Object.values(filters).some(Boolean) && (
            <button className="text-button" onClick={() => setFilters({})}>
              <X size={14} /> حذف فیلترها
            </button>
          )}
          <div className="popover-anchor" ref={columnMenu}>
            <button
              className={`btn btn-small ${showColumns ? 'button-selected' : ''}`}
              aria-expanded={showColumns}
              onClick={() => setShowColumns(!showColumns)}
            >
              <SlidersHorizontal size={15} />
              <span>ستون‌ها</span>
            </button>
            {showColumns && (
              <div className="columns-popover">
                <strong>نمایش ستون‌ها</strong>
                <small>هر ستون، جست‌وجوی مستقل دارد.</small>
                {columns.map((c) => (
                  <label key={c.key}>
                    <input
                      type="checkbox"
                      checked={visible.includes(c.key)}
                      disabled={visible.length === 1 && visible.includes(c.key)}
                      onChange={() =>
                        setVisible(
                          visible.includes(c.key)
                            ? visible.filter((k) => k !== c.key)
                            : [...visible, c.key],
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
                <button className="text-button" onClick={() => setShowColumns(false)}>
                  انجام شد
                </button>
              </div>
            )}
          </div>
          <button
            className="btn btn-small"
            disabled={exporting || loading || !totalCount}
            onClick={exportFile}
          >
            <Download size={15} />
            <span>
              {exporting
                ? 'در حال ساخت…'
                : selected.length
                  ? `خروجی ${fmt(selected.length)} انتخاب`
                  : 'خروجی اکسل'}
            </span>
          </button>
        </div>
      </div>
      {Object.entries(filters).some(([, value]) => value) && (
        <div className="active-filter-list" aria-label="فیلترهای فعال">
          {Object.entries(filters)
            .filter(([, value]) => value)
            .map(([key, value]) => (
              <button
                key={key}
                onClick={() => setFilters((current) => ({ ...current, [key]: '' }))}
                aria-label={`حذف فیلتر ${columns.find((c) => c.key === key)?.label}`}
              >
                <span>
                  {columns.find((c) => c.key === key)?.label}: {value}
                </span>
                <X size={12} />
              </button>
            ))}
        </div>
      )}
      {loadError && (
        <div className="form-error" role="alert">
          {loadError}
        </div>
      )}
      {loading && (
        <div className="field-help" role="status">
          در حال دریافت نتایج…
        </div>
      )}
      <div className="table-scroll" aria-busy={loading}>
        <table>
          <thead>
            <tr>
              <th className="checkbox-cell">
                <input
                  type="checkbox"
                  aria-label="انتخاب همه ردیف‌های این صفحه"
                  checked={!!pageRows.length && pageRows.every((r) => selected.includes(r.id))}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...new Set([...selected, ...pageRows.map((r) => r.id)])]
                        : selected.filter((id) => !pageRows.some((r) => r.id === id)),
                    )
                  }
                />
              </th>
              {cols.map((c) => (
                <th
                  key={c.key}
                  aria-sort={
                    sort.key === c.key
                      ? sort.direction === 1
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    className="sort-button"
                    onClick={() =>
                      setSort({ key: c.key, direction: sort.key === c.key ? -sort.direction : 1 })
                    }
                  >
                    {c.label}
                    {sort.key === c.key ? (
                      sort.direction === 1 ? (
                        <ArrowUp size={12} />
                      ) : (
                        <ArrowDown size={12} />
                      )
                    ) : (
                      <ArrowUpDown size={12} />
                    )}
                  </button>
                </th>
              ))}
              {(onView || actions) && <th className="action-cell">عملیات</th>}
            </tr>
            <tr className="column-filters">
              <th />
              <>
                {cols.map((c) => (
                  <th key={c.key}>
                    <div>
                      <Search size={12} />
                      <input
                        aria-label={`جست‌وجوی ${c.label}`}
                        placeholder={c.type === 'date' ? 'تاریخ…' : `${c.label}…`}
                        value={filters[c.key] || ''}
                        onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })}
                      />
                    </div>
                  </th>
                ))}
              </>
              {(onView || actions) && <th />}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => (
              <tr key={r.id} className={selected.includes(r.id) ? 'selected-row' : ''}>
                <td className="checkbox-cell">
                  <input
                    type="checkbox"
                    aria-label={`انتخاب ${String(r.code || r.name || r.id)}`}
                    checked={selected.includes(r.id)}
                    onChange={() =>
                      setSelected(
                        selected.includes(r.id)
                          ? selected.filter((id) => id !== r.id)
                          : [...selected, r.id],
                      )
                    }
                  />
                </td>
                {cols.map((c, i) => (
                  <td
                    key={c.key}
                    className={`${c.type === 'money' ? 'money-cell' : ''} ${i === 0 ? 'first-cell' : ''}`}
                  >
                    {i === 0 && onView ? (
                      <button className="first-cell-link" onClick={() => onView(r)}>
                        {c.render ? c.render(r) : display(r, c) || 'مشاهده جزئیات'}
                      </button>
                    ) : c.render ? (
                      c.render(r)
                    ) : c.key === 'status' ? (
                      <Badge value={r[c.key]} />
                    ) : c.type === 'money' ? (
                      <span className="amount-cell">
                        {fmt(r[c.key])}
                        <small>{String(r.currency || currency)}</small>
                      </span>
                    ) : c.type === 'date' ? (
                      <span className="date-cell">{date(r[c.key])}</span>
                    ) : c.key === 'progress' ? (
                      <div className="progress-cell">
                        <span>{fmt(r[c.key])}٪</span>
                        <i>
                          <b style={{ width: `${Number(r[c.key])}%` }} />
                        </i>
                      </div>
                    ) : (
                      display(r, c) || <span className="muted">—</span>
                    )}
                  </td>
                ))}
                {(onView || actions) && (
                  <td className="action-cell">
                    {actions ? (
                      actions(r)
                    ) : (
                      <button
                        className="row-view"
                        onClick={() => onView?.(r)}
                        aria-label={`مشاهده ${String(r.code || r.name || '')}`}
                      >
                        مشاهده
                        <ChevronLeft size={13} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!pageRows.length && (
          <div className="empty-state">
            <span className="empty-icon">
              <Inbox size={29} />
            </span>
            <h3>{rows.length ? 'نتیجه‌ای پیدا نشد' : 'هنوز اطلاعاتی ثبت نشده'}</h3>
            <p>
              {rows.length
                ? 'عبارت جست‌وجو یا فیلترهای ستون‌ها را تغییر دهید.'
                : 'اولین رکورد را اضافه کنید تا این بخش شکل بگیرد.'}
            </p>
            {rows.length ? (
              <button
                className="btn"
                onClick={() => {
                  setQuery('');
                  setFilters({});
                }}
              >
                پاک کردن فیلترها
              </button>
            ) : (
              emptyAction
            )}
          </div>
        )}
      </div>
      <div className="table-footer">
        <span>
          {totalCount
            ? `${fmt((safePage - 1) * pageSize + 1)} تا ${fmt(Math.min(safePage * pageSize, totalCount))} از ${fmt(totalCount)} مورد`
            : '۰ مورد'}
          {selected.length > 0 && (
            <button className="text-button" onClick={() => setSelected([])}>
              {' '}
              · لغو انتخاب {fmt(selected.length)} مورد
            </button>
          )}
        </span>
        <div className="pagination">
          <SearchSelect
            aria-label="تعداد ردیف در صفحه"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {[5, 8, 10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {fmt(n)} ردیف
              </option>
            ))}
          </SearchSelect>
          <button
            aria-label="صفحه قبل"
            disabled={safePage === 1}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronRight size={16} />
          </button>
          {Array.from(
            { length: Math.min(pages, 5) },
            (_, i) => Math.max(1, Math.min(safePage - 2, pages - 4)) + i,
          ).map((p) => (
            <button
              key={p}
              className={p === safePage ? 'current-page' : ''}
              onClick={() => setPage(p)}
            >
              {fmt(p)}
            </button>
          ))}
          <button
            aria-label="صفحه بعد"
            disabled={safePage === pages}
            onClick={() => setPage(safePage + 1)}
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
