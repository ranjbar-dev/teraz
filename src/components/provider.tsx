'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, X, AlertCircle } from 'lucide-react';
import type { Row, Scope, User } from '@/lib/types';
import { Confirm } from './ui';
type Boot = {
  user: User;
  scope: Scope;
  companies: Row[];
  branches: Row[];
  years: Row[];
  settings: Record<string, string | number>;
  lookups: Record<string, Row[]>;
};
type Context = {
  boot: Boot | null;
  scope: Scope;
  loading: boolean;
  error: string;
  setScope: (value: Partial<Scope>) => void;
  reload: () => Promise<void>;
  api: <T = unknown>(path: string, options?: RequestInit) => Promise<T>;
  notify: (message: string, error?: boolean) => void;
  fmt: (value: unknown, compact?: boolean) => string;
  date: (value: unknown) => string;
  currency: string;
  canWrite: boolean;
  setUnsaved: (dirty: boolean) => void;
  guard: (action: () => void) => void;
};
const AppContext = createContext<Context>(null!);
export function useApp() {
  return useContext(AppContext);
}
export function AppProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [scope, updateScope] = useState<Scope>({ companyId: '', branchId: 'all', yearId: '' });
  const [ready, setReady] = useState(false);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const requestSequence = useRef(0);
  const unsaved = useRef(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const setUnsaved = useCallback((dirty: boolean) => {
    unsaved.current = dirty;
  }, []);
  const guard = useCallback((action: () => void) => {
    if (unsaved.current) setPendingAction(() => action);
    else action();
  }, []);
  useEffect(() => {
    const navigate = (event: MouseEvent) => {
      if (
        !unsaved.current ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (
        !anchor ||
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        anchor.origin !== location.origin ||
        anchor.href === location.href
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      guard(() => router.push(anchor.pathname + anchor.search + anchor.hash));
    };
    const before = (event: BeforeUnloadEvent) => {
      if (unsaved.current) event.preventDefault();
    };
    document.addEventListener('click', navigate, true);
    window.addEventListener('beforeunload', before);
    return () => {
      document.removeEventListener('click', navigate, true);
      window.removeEventListener('beforeunload', before);
    };
  }, [guard, router]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem('taraz-scope');
      if (stored) updateScope(JSON.parse(stored));
    } catch {}
    setReady(true);
  }, []);
  const api = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
      const params = new URLSearchParams(Object.entries(scope).filter(([, v]) => !!v));
      let res: Response;
      try {
        res = await fetch(`/api/${path}${path.includes('?') ? '&' : '?'}${params}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...(options?.method === 'POST' ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
            ...options?.headers,
          },
          cache: 'no-store',
        });
      } catch {
        throw new Error('ارتباط برقرار نشد. اتصال خود را بررسی کنید و دوباره تلاش کنید.');
      }
      const data = await res.json().catch(() => {
        throw new Error('پاسخ سرور قابل خواندن نیست. دوباره تلاش کنید.');
      });
      if (!res.ok) {
        if (res.status === 401) router.replace('/login');
        if (data.code === 'PLATFORM_REDIRECT') router.replace('/platform');
        throw new Error(data.error || 'ارتباط با سرور برقرار نشد.');
      }
      return data;
    },
    [scope, router],
  );
  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try {
      const data = await api<Boot>('bootstrap');
      if (sequence !== requestSequence.current) return;
      setBoot(data);
      localStorage.setItem('taraz-resolved-scope', JSON.stringify(data.scope));
      setError('');
    } catch (e) {
      if (sequence === requestSequence.current) setError((e as Error).message);
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    if (ready) {
      setLoading(true);
      void reload();
    }
  }, [ready, reload]);
  const setScope = (value: Partial<Scope>) =>
    guard(() => {
      const next = { ...scope, ...value };
      if (value.companyId && value.companyId !== scope.companyId) {
        next.branchId = 'all';
        next.yearId = '';
      }
      updateScope(next);
      localStorage.setItem('taraz-scope', JSON.stringify(next));
    });
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const fmt = (value: unknown, compact = false) =>
    new Intl.NumberFormat(boot?.settings.digits === 'لاتین' ? 'en-US' : 'fa-IR', {
      maximumFractionDigits: 2,
      ...(compact ? { notation: 'compact' as const } : {}),
    }).format(
      (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)
        ? value
        : Number(value) || 0) as number,
    );
  const date = (value: unknown) => {
    if (!value) return '—';
    const d = new Date(String(value).slice(0, 10) + 'T12:00:00');
    return isNaN(d.getTime())
      ? String(value)
      : new Intl.DateTimeFormat(
          boot?.settings.calendar === 'میلادی' ? 'fa-IR-u-ca-gregory' : 'fa-IR-u-ca-persian',
          {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            numberingSystem: boot?.settings.digits === 'لاتین' ? 'latn' : 'arabext',
          },
        ).format(d);
  };
  return (
    <AppContext.Provider
      value={{
        boot,
        scope: boot?.scope && !scope.companyId ? boot.scope : scope,
        loading,
        error,
        setScope,
        reload,
        api,
        fmt,
        date,
        setUnsaved,
        guard,
        currency: String(boot?.settings.currency || 'تومان'),
        canWrite: boot?.user.role !== 'مشاهده‌گر',
        notify: (message, error = false) => setToast({ message, error }),
      }}
    >
      {children}
      {pendingAction && (
        <Confirm
          title="تغییرات ذخیره نشده"
          description="با ترک این فرم، تغییرات ذخیره‌نشده از دست می‌روند. برای ادامهٔ ویرایش، انصراف را بزنید."
          onClose={() => setPendingAction(null)}
          onConfirm={() => {
            unsaved.current = false;
            const action = pendingAction;
            setPendingAction(null);
            action();
          }}
        />
      )}
      {toast && (
        <div className={`toast ${toast.error ? 'toast-error' : ''}`} role="status">
          {toast.error ? <AlertCircle2Fallback /> : <CheckCircle2 size={20} />}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} aria-label="بستن پیام">
            <X size={17} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
function AlertCircle2Fallback() {
  return <AlertCircle size={20} />;
}
