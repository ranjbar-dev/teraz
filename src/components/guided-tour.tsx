'use client';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { introduction, pageTour, tourCatalog, type TourStep } from '@/lib/tours';
import { useApp } from './provider';

export function GuidedTour() {
  const { boot, api, canWrite, loading } = useApp();
  const pathname = usePathname();
  const params = useSearchParams();
  const [tour, setTour] = useState<{ steps: TourStep[]; index: number } | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const visited = useRef(false);
  const manuallyStarted = useRef(false);
  const start = useCallback(
    (overview = false) => {
      previousFocus.current = document.activeElement as HTMLElement;
      manuallyStarted.current = true;
      setSaveError(false);
      setTour({ steps: overview ? introduction : pageTour(pathname, canWrite), index: 0 });
    },
    [pathname, canWrite],
  );
  useEffect(() => {
    let cancelled = false;
    api<{ seen: boolean }>('onboarding')
      .then((data) => {
        if (cancelled) return;
        visited.current = data.seen;
        if (!data.seen && !manuallyStarted.current) {
          previousFocus.current = document.activeElement as HTMLElement;
          setTour({ steps: introduction, index: 0 });
        }
      })
      .catch(() => {
        /* Manual help stays available if status cannot be loaded. */
      });
    return () => {
      cancelled = true;
    };
  }, [api]);
  useEffect(() => {
    setTour(null);
    if (params.get('tour') === 'page') start();
    const replay = () => start(true);
    window.addEventListener('taraz-tour-start', replay);
    return () => window.removeEventListener('taraz-tour-start', replay);
  }, [pathname, params, start]);
  const close = useCallback(async () => {
    if (busy) return;
    setTour(null);
    previousFocus.current?.focus({ preventScroll: true });
    if (visited.current) return;
    setBusy(true);
    try {
      await api('onboarding', { method: 'PATCH', body: '{}' });
      visited.current = true;
      setSaveError(false);
    } catch {
      setSaveError(true);
    } finally {
      setBusy(false);
    }
  }, [api, busy]);
  useEffect(() => {
    if (!tour) return;
    panel.current?.focus({ preventScroll: true });
    const current = tour.steps[tour.index];
    let highlighted: HTMLElement | null = null;
    const highlight = () => {
      const candidate = document.querySelector<HTMLElement>(current.target || '.page-heading');
      const rect = candidate?.getBoundingClientRect();
      if (
        !candidate ||
        !rect ||
        !rect.width ||
        !rect.height ||
        rect.right <= 0 ||
        rect.left >= window.innerWidth
      )
        return;
      if (highlighted === candidate) return;
      highlighted?.classList.remove('tour-highlight');
      highlighted = candidate;
      candidate.classList.add('tour-highlight');
      candidate.scrollIntoView({ block: 'center', behavior: 'instant' });
    };
    highlight();
    const observer = new MutationObserver(highlight);
    const main = document.getElementById('main-content');
    if (main) observer.observe(main, { childList: true, subtree: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void close();
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      observer.disconnect();
      highlighted?.classList.remove('tour-highlight');
      window.removeEventListener('keydown', key);
    };
  }, [tour, close]);
  if (!boot) return null;
  const current = tour?.steps[tour.index];
  return (
    <>
      <button
        type="button"
        className="btn tour-trigger"
        data-tour="help"
        onClick={() => start()}
        disabled={loading || busy}
      >
        <BookOpen size={17} />
        <span>راهنمای این صفحه</span>
      </button>
      {saveError &&
        createPortal(
          <div className="tour-save-error" role="alert">
            وضعیت آموزش ذخیره نشد؛ ممکن است در ورود بعدی دوباره نمایش داده شود.
            <button className="btn btn-small" disabled={busy} onClick={() => void close()}>
              تلاش دوباره
            </button>
          </div>,
          document.body,
        )}
      {tour &&
        current &&
        createPortal(
          <aside
            className="tour-panel"
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="false"
            aria-labelledby="tour-title"
            aria-describedby="tour-description"
            dir="rtl"
          >
            <div className="tour-heading">
              <span>
                راهنمای تعاملی · {new Intl.NumberFormat('fa-IR').format(tour.index + 1)} از{' '}
                {new Intl.NumberFormat('fa-IR').format(tour.steps.length)}
              </span>
              <button className="icon-button" aria-label="بستن آموزش" onClick={() => void close()}>
                <X size={20} />
              </button>
            </div>
            <div
              className="tour-progress"
              role="progressbar"
              aria-label="پیشرفت آموزش"
              aria-valuemin={0}
              aria-valuemax={tour.steps.length}
              aria-valuenow={tour.index + 1}
            >
              {tour.steps.map((_, i) => (
                <span key={i} className={i <= tour.index ? 'complete' : ''} />
              ))}
            </div>
            <div aria-live="polite" aria-atomic="true">
              <h2 id="tour-title">{current.title}</h2>
              <p id="tour-description">{current.text}</p>
            </div>
            <div className="tour-actions">
              <button
                className="btn btn-primary"
                onClick={() =>
                  tour.index === tour.steps.length - 1
                    ? void close()
                    : setTour({ ...tour, index: tour.index + 1 })
                }
              >
                {tour.index === tour.steps.length - 1 ? 'پایان آموزش' : 'بعدی'}
              </button>
              <button
                className="btn"
                disabled={tour.index === 0}
                onClick={() => setTour({ ...tour, index: tour.index - 1 })}
              >
                قبلی
              </button>
              <button className="text-button" onClick={() => void close()}>
                فعلاً رد می‌کنم
              </button>
            </div>
            <Link className="tour-all" href="/help" onClick={() => void close()}>
              همهٔ آموزش‌ها و شروع سریع
            </Link>
          </aside>,
          document.body,
        )}
    </>
  );
}

export function TourCatalog() {
  const { boot } = useApp();
  const [query, setQuery] = useState('');
  const items = tourCatalog(boot?.user.role === 'مدیر').filter((item) =>
    item.title.includes(query),
  );
  return (
    <section className="panel tour-catalog" aria-labelledby="tour-catalog-title">
      <div className="flex-between">
        <h2 id="tour-catalog-title">آموزش قدم‌به‌قدم بخش‌ها</h2>
        <button
          className="btn btn-primary"
          onClick={() => window.dispatchEvent(new Event('taraz-tour-start'))}
        >
          اجرای دوبارهٔ شروع سریع
        </button>
      </div>
      <p>
        یک بخش را انتخاب کنید تا صفحه باز شود و آموزش روی همان صفحه اجرا شود. در فرم‌ها و جزئیات نیز
        «راهنمای این صفحه» همراه شماست.
      </p>
      <label className="field">
        پیدا کردن آموزش
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="نام صفحه یا گزارش"
        />
      </label>
      <div className="tour-links">
        {items.map((item) => (
          <Link href={item.path + '?tour=page'} key={item.path}>
            {item.title}
            <span aria-hidden="true">←</span>
          </Link>
        ))}
      </div>
      {!items.length && <p role="status">آموزشی با این نام پیدا نشد. عبارت کوتاه‌تری وارد کنید.</p>}
    </section>
  );
}
