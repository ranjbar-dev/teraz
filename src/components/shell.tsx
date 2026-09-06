'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpLeft,
  Bell,
  ChevronDown,
  ChevronLeft,
  Search,
  Menu,
  X,
  LogOut,
  Settings2,
  Command,
  CircleHelp,
  CheckCheck,
} from 'lucide-react';
import { modules, reports } from '@/lib/modules';
import { Icon, Logo } from './icons';
import { useApp } from './provider';

export function Shell({ children }: { children: React.ReactNode }) {
  const { boot, loading, error, setScope, api, scope, date, reload } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const currentKey = pathname.split('/')[1];
  const selected = modules.find((m) => m.key === currentKey);
  const [expanded, setExpanded] = useState('خرید و فروش');
  const [mobile, setMobile] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [bell, setBell] = useState(false);
  const [profile, setProfile] = useState(false);
  const [read, setRead] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selected) setExpanded(selected.group);
    setMobile(false);
  }, [pathname, selected]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setBell(false);
        setProfile(false);
        setMobile(false);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  if (loading && !boot)
    return (
      <div className="loading-screen">
        <Logo />
        <div className="spinner" />
        <p>در حال آماده‌سازی فضای کاری شما…</p>
      </div>
    );
  if (!boot)
    return (
      <div className="loading-screen">
        <Logo />
        <p>{error || 'در حال ورود…'}</p>
        <button className="btn" onClick={reload}>
          تلاش دوباره
        </button>
        <Link href="/login">صفحه ورود</Link>
      </div>
    );
  const groups = [
    ...new Set(modules.filter((m) => !m.admin || boot.user.role === 'مدیر').map((m) => m.group)),
  ];
  const pageTitle =
    currentKey === 'dashboard'
      ? 'نمای کلی'
      : currentKey === 'reports'
        ? 'گزارش‌های مالی'
        : currentKey === 'settings'
          ? 'تنظیمات'
          : currentKey === 'activity'
            ? 'تاریخچه فعالیت‌ها'
            : selected?.title || 'فضای کاری';
  const results = [
    ...modules
      .filter((m) => !m.admin || boot.user.role === 'مدیر')
      .map((m) => ({ title: m.title, path: `/${m.key}`, icon: m.icon })),
    ...reports.map((r) => ({ title: r.title, path: `/reports/${r.key}`, icon: r.icon })),
    ...Object.entries(boot.lookups)
      .filter(([k]) => ['people', 'products', 'sales', 'projects'].includes(k))
      .flatMap(([k, rows]) =>
        rows.map((r) => ({
          title: `${r.name || r.code} · ${modules.find((m) => m.key === k)?.singular}`,
          path: `/${k}/${r.id}`,
          icon: 'receipt',
        })),
      ),
  ]
    .filter((r) => r.title.includes(query))
    .slice(0, 15);
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="بستن فهرست"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
        <Link href="/dashboard" className="brand-link">
          <Logo />
        </Link>
        <div className="workspace-label">
          <span className="live-dot" /> فضای کاری شما{' '}
          <span className="version-label">نسخه آزمایشی</span>
        </div>
        <nav className="side-nav" aria-label="منوی اصلی">
          <Link
            className={`nav-item ${currentKey === 'dashboard' ? 'active' : ''}`}
            href="/dashboard"
          >
            <Icon name="dashboard" size={19} />
            <span>داشبورد</span>
            {currentKey === 'dashboard' && <span className="nav-active-dot" />}
          </Link>
          <div className="nav-section-label">مدیریت کسب‌وکار</div>
          {groups
            .filter((g) => g !== 'مدیریت')
            .map((group) => {
              const items = modules.filter((m) => m.group === group);
              const open = expanded === group;
              return (
                <div key={group}>
                  <button
                    className={`nav-item nav-group ${selected?.group === group ? 'group-active' : ''}`}
                    onClick={() => setExpanded(open ? '' : group)}
                    aria-expanded={open}
                  >
                    <Icon name={items[0].icon} size={19} />
                    <span>{group}</span>
                    <ChevronLeft size={14} className={open ? 'rotate-down' : ''} />
                  </button>
                  {open && (
                    <div className="nav-children">
                      {items.map((m) => (
                        <Link
                          key={m.key}
                          href={`/${m.key}`}
                          className={m.key === currentKey ? 'child-active' : ''}
                        >
                          {m.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          <div className="nav-section-label">بینش و مدیریت</div>
          <Link className={`nav-item ${currentKey === 'reports' ? 'active' : ''}`} href="/reports">
            <Icon name="chart" size={19} />
            <span>گزارش‌های مالی</span>
          </Link>
          {boot.user.role === 'مدیر' && (
            <>
              <button
                className={`nav-item ${selected?.group === 'مدیریت' ? 'group-active' : ''}`}
                onClick={() => setExpanded(expanded === 'مدیریت' ? '' : 'مدیریت')}
              >
                <Icon name="shield" size={19} />
                <span>مدیریت سازمان</span>
                <ChevronLeft size={14} />
              </button>
              {expanded === 'مدیریت' && (
                <div className="nav-children">
                  {modules
                    .filter((m) => m.group === 'مدیریت')
                    .map((m) => (
                      <Link
                        key={m.key}
                        href={`/${m.key}`}
                        className={m.key === currentKey ? 'child-active' : ''}
                      >
                        {m.title}
                      </Link>
                    ))}
                </div>
              )}
              <Link
                className={`nav-item ${currentKey === 'settings' ? 'active' : ''}`}
                href="/settings"
              >
                <Settings2 size={19} />
                <span>تنظیمات</span>
              </Link>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Icon name="scale" size={20} />
            </span>
            <strong>همه‌چیز سر جای خودش.</strong>
            <p>
              تصویر روشن کسب‌وکارتان،
              <br />
              از اولین ثبت تا آخرین گزارش.
            </p>
            <Link href="/reports">
              مشاهده گزارش‌ها <ArrowUpLeft size={15} />
            </Link>
          </div>
          <Link href="/help" className="help-link">
            <CircleHelp size={18} /> راهنمای تراز <ArrowUpLeft size={14} />
          </Link>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-right">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="باز کردن فهرست"
            >
              <Menu size={22} />
            </button>
            <div className="company-select">
              <span className="company-icon">
                <Icon name="building" size={18} />
              </span>
              <select
                aria-label="انتخاب شرکت"
                value={boot.scope.companyId}
                onChange={(e) => setScope({ companyId: e.target.value })}
              >
                {boot.companies
                  .filter((c) => c.status === 'فعال')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {String(c.name)}
                    </option>
                  ))}
              </select>
              <ChevronDown size={13} />
            </div>
            <span className="topbar-divider" />
            <select
              className="branch-select"
              aria-label="انتخاب شعبه"
              value={scope.branchId || 'all'}
              onChange={(e) => setScope({ branchId: e.target.value })}
            >
              <option value="all">همه شعبه‌ها</option>
              {boot.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {String(b.name)}
                </option>
              ))}
            </select>
          </div>
          <div className="topbar-left">
            <button className="global-search" onClick={() => setSearchOpen(true)}>
              <Search size={17} />
              <span>جست‌وجو در تراز…</span>
              <kbd>⌘ K</kbd>
            </button>
            <div className="popover-anchor">
              <button
                className="icon-button notification-button"
                onClick={() => {
                  setBell(!bell);
                  setProfile(false);
                }}
                aria-label="اعلان‌ها"
              >
                <Bell size={19} />
                {!read && <i />}
              </button>
              {bell && (
                <div className="header-popover">
                  <div className="flex-between">
                    <strong>یادآوری‌ها</strong>
                    <button className="text-button" onClick={() => setRead(true)}>
                      <CheckCheck size={16} /> خواندم
                    </button>
                  </div>
                  <Link href="/checks" onClick={() => setBell(false)}>
                    <Icon name="check" size={20} />
                    <span>
                      چک‌های در جریان<small>سررسیدها را در مدیریت چک‌ها بررسی کنید.</small>
                    </span>
                  </Link>
                  <Link href="/reports/inventory" onClick={() => setBell(false)}>
                    <Icon name="warehouse" size={20} />
                    <span>
                      وضعیت موجودی انبار<small>کالاهای نیازمند تأمین را بررسی کنید.</small>
                    </span>
                  </Link>
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <div className="popover-anchor">
              <button
                className="profile-button"
                onClick={() => {
                  setProfile(!profile);
                  setBell(false);
                }}
              >
                <span className="avatar avatar-user">{boot.user.name.charAt(0)}</span>
                <span className="profile-name">
                  {boot.user.name}
                  <small>{boot.user.role}</small>
                </span>
                <ChevronDown size={13} />
              </button>
              {profile && (
                <div className="header-popover profile-popover">
                  <strong>{boot.user.name}</strong>
                  <small dir="ltr">{boot.user.email}</small>
                  <Link href="/activity" onClick={() => setProfile(false)}>
                    تاریخچه فعالیت‌ها
                  </Link>
                  <button
                    className="danger-text"
                    onClick={async () => {
                      await api('auth', { method: 'DELETE' });
                      localStorage.removeItem('taraz-scope');
                      router.replace('/login');
                    }}
                  >
                    <LogOut size={17} /> خروج از حساب
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className="context-bar">
          <div>
            <Link href="/dashboard">فضای کاری</Link>
            <ChevronLeft size={12} />
            <span>{pageTitle}</span>
          </div>
          <div className="context-controls">
            <span className="today-date">
              <Icon name="calendar" size={14} />
              {date(new Date().toISOString())}
            </span>
            <select
              aria-label="سال مالی"
              value={boot.scope.yearId}
              onChange={(e) => setScope({ yearId: e.target.value })}
            >
              {boot.years.map((y) => (
                <option key={y.id} value={y.id}>
                  {String(y.name)}
                  {y.status === 'بسته' ? ' · بسته' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <main
          id="main-content"
          className="content"
          key={`${boot.scope.companyId}-${boot.scope.branchId}-${boot.scope.yearId}`}
        >
          {loading ? (
            <div className="page-loading">
              <div className="spinner" />
            </div>
          ) : error ? (
            <div className="empty-state">
              <h2>{error}</h2>
              <button className="btn" onClick={reload}>
                تلاش دوباره
              </button>
            </div>
          ) : (
            children
          )}
        </main>
        <footer className="app-footer">
          <span>تراز · همراه حساب‌های شما</span>
          <span>
            <i className="live-dot" /> محیط آزمایشی · داده‌های محلی
          </span>
        </footer>
      </div>
      {searchOpen && (
        <div className="modal-backdrop" onClick={() => setSearchOpen(false)}>
          <section
            className="command-modal"
            role="dialog"
            aria-modal="true"
            aria-label="جست‌وجوی سراسری"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="command-input">
              <Search size={22} />
              <input
                ref={searchRef}
                placeholder="نام صفحه، شخص، کالا یا شماره فاکتور…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                className="icon-button"
                onClick={() => setSearchOpen(false)}
                aria-label="بستن"
              >
                <X size={20} />
              </button>
            </div>
            <div className="command-results">
              <small>{query ? 'نتایج جست‌وجو' : 'دسترسی سریع'}</small>
              {results.map((r, i) => (
                <Link key={i} href={r.path} onClick={() => setSearchOpen(false)}>
                  <Icon name={r.icon} size={19} />
                  <span>{r.title}</span>
                  <ArrowUpLeft size={16} />
                </Link>
              ))}
              {!results.length && <div className="empty-state">نتیجه‌ای پیدا نشد.</div>}
            </div>
            <div className="command-footer">
              <Command size={13} /> جست‌وجو در صفحات و اطلاعات شرکت جاری <kbd>ESC</kbd>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
