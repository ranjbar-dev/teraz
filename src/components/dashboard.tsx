'use client';
import { SearchSelect } from './search-select';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Plus, ArrowUpLeft, ChevronLeft, CalendarDays, ArrowLeft, Sparkles } from 'lucide-react';
import { useApp } from './provider';
import { Icon } from './icons';
import { PageHeading, Loading } from './ui';
import { DataTable, type Column } from './data-table';
import type { dashboard as makeDashboard } from '@/lib/reports';
type Data = ReturnType<typeof makeDashboard>;
export function Dashboard() {
  const { api, boot, fmt, date, canWrite } = useApp();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [months, setMonths] = useState('6');
  const [error, setError] = useState('');
  useEffect(() => {
    let ignore = false;
    api<Data>(`dashboard?months=${months}`)
      .then((d) => {
        if (!ignore) setData(d);
      })
      .catch((e) => {
        if (!ignore) setError(e.message);
      });
    return () => {
      ignore = true;
    };
  }, [api, months]);
  if (error)
    return (
      <div className="empty-state">
        <p>{error}</p>
        <button className="btn" onClick={() => location.reload()}>
          تلاش دوباره
        </button>
      </div>
    );
  if (!data) return <Loading />;
  const stats = [
    {
      title: 'فروش کل دوره',
      value: data.sales,
      icon: 'receipt',
      text: 'فاکتورهای تأییدشده',
      href: '/sales',
      className: 'stat-mint',
    },
    {
      title: 'موجودی نقد و بانک',
      value: data.balance,
      icon: 'wallet',
      text: `${fmt(data.banks.length)} حساب و صندوق`,
      href: '/banks',
      className: 'stat-cream',
    },
    {
      title: 'مطالبات از مشتریان',
      value: data.receivables,
      icon: 'users',
      text: 'ماندهٔ حساب‌های دریافتنی',
      href: '/reports/receivables',
      className: 'stat-blue',
    },
    {
      title: 'سود خالص دوره',
      value: data.profit,
      icon: 'chart',
      text: 'پس از کسر هزینه‌ها',
      href: '/reports/profit-loss',
      className: 'stat-purple',
    },
  ];
  const chart = data.chart.map((r) => ({
    ...r,
    label: new Intl.DateTimeFormat('fa-IR-u-ca-persian', { month: 'short' }).format(
      new Date(r.month + 'T12:00:00'),
    ),
  }));
  const totalExpenses = data.categories.reduce((s, r) => s + r.value, 0);
  const colors = ['#21896c', '#83b8a6', '#bfd5c8', '#e5ece7'];
  const columns: Column[] = [
    {
      key: 'code',
      label: 'شماره فاکتور',
      render: (r) => (
        <span className="document-code">
          <span className="document-icon">
            <Icon name="receipt" size={16} />
          </span>
          {String(r.code)}
        </span>
      ),
    },
    {
      key: 'person',
      label: 'طرف حساب',
      render: (r) => (
        <span className="person-cell">
          <span className={`avatar avatar-small tone-${String(r.id).length % 4}`}>
            {String(r.person).charAt(0)}
          </span>
          {String(r.person)}
        </span>
      ),
    },
    { key: 'date', label: 'تاریخ صدور', type: 'date' },
    { key: 'total', label: 'مبلغ فاکتور', type: 'money' },
    { key: 'status', label: 'وضعیت' },
  ];
  return (
    <div className="dashboard-page">
      <PageHeading
        eyebrow="یک نگاه، همهٔ حساب‌ها"
        title={`روزتان بخیر، ${boot?.user.name.split(' ')[0]} 👋`}
        description="این‌جا تصویر امروز کسب‌وکار شماست. همه‌چیز تحت کنترل است."
      >
        <Link href="/reports" className="btn">
          <Icon name="chart" size={17} /> گزارش‌های مالی
        </Link>
        {canWrite && (
          <Link href="/sales/new" className="btn btn-primary">
            <Plus size={18} /> فاکتور جدید
          </Link>
        )}
      </PageHeading>
      <div className="overview-period">
        <span>
          <i className="live-dot" /> نمای کلی عملکرد
        </span>
        <span>
          سال مالی {date(data.start).split('/')[0]} <span className="muted">/</span> مبالغ به تومان
        </span>
      </div>
      <div className="stats-grid">
        {stats.map((s, i) => (
          <Link
            href={s.href}
            className="stat-card"
            key={s.title}
            style={{ animationDelay: `${i * 55}ms` }}
          >
            <div className="stat-top">
              <span>{s.title}</span>
              <span className={`stat-icon ${s.className}`}>
                <Icon name={s.icon} size={21} />
              </span>
            </div>
            <div className="stat-value">
              {fmt(s.value)}
              <span>تومان</span>
            </div>
            <div className="stat-bottom">
              <span>
                {i === 3 ? (
                  <span className="positive">
                    <ArrowUpLeft size={13} /> {s.text}
                  </span>
                ) : (
                  s.text
                )}
              </span>
              <ArrowUpLeft size={16} />
            </div>
          </Link>
        ))}
      </div>
      <div className="dashboard-charts">
        <section className="panel cash-chart-panel">
          <div className="panel-heading">
            <div>
              <h2>نبض مالی کسب‌وکار</h2>
              <p>روند درآمد و هزینه در طول دوره</p>
            </div>
            <SearchSelect
              className="select-compact"
              aria-label="دوره نمودار"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            >
              <option value="6">۶ ماه ابتدای سال</option>
              <option value="12">کل سال مالی</option>
            </SearchSelect>
          </div>
          <div className="chart-legend">
            <span>
              <i style={{ background: '#258c6c' }} /> درآمد
            </span>
            <span>
              <i style={{ background: '#c4d8cd' }} /> هزینه
            </span>
            <small>میلیون تومان</small>
          </div>
          <div className="cash-chart" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ top: 12, right: 12, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#319873" stopOpacity={0.16} />
                    <stop offset="100%" stopColor="#319873" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#e8eeea" strokeDasharray="3 5" />
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#919c97', fontSize: 11 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#919c97', fontSize: 10 }}
                  tickFormatter={(v) => fmt(Number(v) / 1000000)}
                  width={58}
                />
                <Tooltip
                  content={({ active, payload, label }) =>
                    active && payload?.length ? (
                      <div className="chart-tooltip" dir="rtl">
                        <strong>{label}</strong>
                        {payload.map((p, i) => (
                          <p key={i}>
                            {p.dataKey === 'income' ? 'درآمد' : 'هزینه'}: {fmt(p.value)} تومان
                          </p>
                        ))}
                      </div>
                    ) : null
                  }
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="#bdcfc3"
                  fill="#eff4f0"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#248966"
                  fill="url(#incomeGradient)"
                  strokeWidth={2.8}
                  activeDot={{ r: 5, stroke: 'white', strokeWidth: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-foot">
            <span>
              <i className="live-dot" /> بر اساس اسناد تأییدشده
            </span>
            <Link href="/reports/profit-loss">
              جزئیات عملکرد <ChevronLeft size={14} />
            </Link>
          </div>
        </section>
        <section className="panel expense-panel">
          <div className="panel-heading">
            <div>
              <h2>هزینه‌ها کجا رفته‌اند؟</h2>
              <p>سهم هر بخش از هزینه‌های دوره</p>
            </div>
            <Link href="/expenses" className="icon-button" aria-label="مشاهده هزینه‌ها">
              <ArrowUpLeft size={18} />
            </Link>
          </div>
          <div className="donut-chart">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.categories.filter((c) => c.value > 0)}
                  dataKey="value"
                  innerRadius={65}
                  outerRadius={85}
                  paddingAngle={4}
                  cornerRadius={3}
                  startAngle={90}
                  endAngle={-270}
                >
                  {data.categories
                    .filter((c) => c.value > 0)
                    .map((c, i) => (
                      <Cell key={c.name} fill={colors[i]} />
                    ))}
                </Pie>
                <Tooltip formatter={(v) => `${fmt(v)} تومان`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <small>مجموع هزینه‌ها</small>
              <strong>{fmt(totalExpenses / 1000000)}</strong>
              <small>میلیون تومان</small>
            </div>
          </div>
          <div className="expense-legend">
            {data.categories.map((c, i) => (
              <div key={c.name}>
                <span>
                  <i style={{ background: colors[i] }} />
                  {c.name}
                </span>
                <strong>
                  {fmt(totalExpenses ? (c.value / totalExpenses) * 100 : 0)}
                  <small>٪</small>
                </strong>
              </div>
            ))}
          </div>
        </section>
      </div>
      <div className="dashboard-lower">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div className="inline-title">
              <h2>آخرین فاکتورهای فروش</h2>
              <span className="count-pill">{fmt(data.recent.length)} فاکتور</span>
            </div>
            <Link className="text-button" href="/sales">
              مشاهده همه <ChevronLeft size={14} />
            </Link>
          </div>
          <DataTable
            rows={data.recent}
            columns={columns}
            title="آخرین فاکتورهای فروش"
            defaultPageSize={5}
            onView={(r) => router.push(`/sales/${r.id}`)}
          />
        </section>
        <div className="dashboard-side">
          <section className="panel accounts-panel">
            <div className="panel-heading">
              <h2>حساب‌های شما</h2>
              <Link href="/banks" className="icon-button" aria-label="تمام حساب‌ها">
                <ArrowUpLeft size={17} />
              </Link>
            </div>
            {data.banks.slice(0, 3).map((b, i) => (
              <Link key={b.id} href={`/banks/${b.id}`} className="bank-row">
                <span className={`bank-logo bank-${i}`}>
                  <Icon name={b.type === 'صندوق' ? 'wallet' : 'landmark'} size={21} />
                </span>
                <div>
                  <strong>{String(b.name)}</strong>
                  <small>{String(b.type)} · حساب فعال</small>
                </div>
                <span className="bank-amount">
                  {fmt(b.balance)}
                  <small>{String(b.currency)}</small>
                </span>
              </Link>
            ))}
            <Link href="/transfers/new" className="bank-transfer">
              <Icon name="arrows" size={16} /> انتقال وجه بین حساب‌ها <ChevronLeft size={13} />
            </Link>
          </section>
          <section className="reminder-panel">
            <span className="reminder-icon">
              <CalendarDays size={20} />
            </span>
            <div>
              <strong>چیزی از قلم نیفتد</strong>
              <p>
                {fmt(data.checks.length)} چک در جریان و {fmt(data.lowStock.length)} مورد موجودی کمتر
                از حداقل دارید.
              </p>
              <Link href="/checks">
                بررسی سررسید چک‌ها <ArrowLeft size={15} />
              </Link>
            </div>
          </section>
        </div>
      </div>
      <section className="quick-actions">
        <div>
          <span className="quick-spark">
            <Sparkles size={19} />
          </span>
          <strong>یک قدم جلوتر</strong>
          <span className="muted">کارهای روزمره، بدون معطلی</span>
        </div>
        {[
          { href: '/receipts/new', name: 'ثبت دریافت', icon: 'down' },
          { href: '/payments/new', name: 'ثبت پرداخت', icon: 'up' },
          { href: '/people/new', name: 'طرف حساب جدید', icon: 'users' },
          { href: '/journals/new', name: 'سند حسابداری', icon: 'book' },
        ].map((a) => (
          <Link key={a.href} href={canWrite ? a.href : a.href.replace('/new', '')}>
            <Icon name={a.icon} size={18} />
            {a.name}
            <ArrowUpLeft size={13} />
          </Link>
        ))}
      </section>
    </div>
  );
}
