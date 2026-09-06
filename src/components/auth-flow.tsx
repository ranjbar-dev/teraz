'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { Logo } from './icons';
export function AuthFlow({
  mode,
}: {
  mode: 'login' | 'register' | 'forgot-password' | 'reset-password' | 'accept-invitation';
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false);
  useEffect(() => {
    const token = new URL(location.href).searchParams.get('token');
    if (token) setValues((v) => ({ ...v, token }));
  }, []);
  const names = {
    login: 'ورود به تراز',
    register: 'فضای کاری خودتان را بسازید',
    'forgot-password': 'بازیابی دسترسی',
    'reset-password': 'رمز تازه، شروع دوباره',
    'accept-invitation': 'پیوستن به سازمان',
  };
  const fields: { key: string; label: string; type?: string; min?: number; pattern?: string }[] =
    mode === 'register'
      ? [
          { key: 'name', label: 'نام و نام خانوادگی' },
          { key: 'organizationName', label: 'نام سازمان' },
          { key: 'slug', label: 'نشانی سازمان (حروف لاتین)', pattern: '[a-z0-9]+(-[a-z0-9]+)*' },
          { key: 'email', label: 'ایمیل', type: 'email' },
          { key: 'password', label: 'رمز عبور (حداقل ۱۲ نویسه)', type: 'password', min: 12 },
        ]
      : mode === 'login'
        ? [
            { key: 'email', label: 'ایمیل', type: 'email' },
            { key: 'password', label: 'رمز عبور', type: 'password' },
          ]
        : mode === 'forgot-password'
          ? [{ key: 'email', label: 'ایمیل حساب', type: 'email' }]
          : mode === 'reset-password'
            ? [{ key: 'password', label: 'رمز جدید (حداقل ۱۲ نویسه)', type: 'password', min: 12 }]
            : [];
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const endpoint = {
        login: 'auth/login',
        register: 'auth/register',
        'forgot-password': 'auth/forgot',
        'reset-password': 'auth/reset',
        'accept-invitation': 'invitations/accept',
      }[mode];
      const res = await fetch('/api/' + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      if (mode === 'forgot-password') {
        setMessage(result.message);
        return;
      }
      if (mode === 'reset-password') {
        router.replace('/login');
        return;
      }
      localStorage.removeItem('taraz-scope');
      router.replace(result.redirect || '/dashboard');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-scene">
      <section className="auth-form-side">
        <Link href="/login">
          <Logo />
        </Link>
        <div className="auth-form-content">
          <span className="eyebrow">فضای یکپارچهٔ مالی کسب‌وکار</span>
          <h1>{names[mode]}</h1>
          <p className="muted">
            {mode === 'register'
              ? '۱۴ روز فرصت بررسی؛ شرکت‌ها، شعبه‌ها و تیم شما در یک فضای مستقل.'
              : mode === 'accept-invitation'
                ? 'برای پذیرش دعوت، با حساب همان ایمیل دعوت‌شده وارد شوید.'
                : 'حساب‌های روشن، تصمیم‌های مطمئن.'}
          </p>
          <form onSubmit={submit}>
            {error && (
              <div role="alert" className="form-error">
                {error}
              </div>
            )}
            {message && (
              <div role="status" className="success-note">
                {message}
              </div>
            )}
            {fields.map((f) => (
              <label className="field" key={f.key}>
                <span>{f.label}</span>
                <div className="auth-input-wrap">
                  <input
                    className="input"
                    aria-label={f.label}
                    required
                    minLength={f.min}
                    maxLength={f.type === 'password' ? 128 : 200}
                    pattern={f.pattern}
                    type={f.type === 'password' && visible ? 'text' : f.type || 'text'}
                    dir={['email', 'password', 'slug'].includes(f.key) ? 'ltr' : undefined}
                    autoComplete={
                      f.type === 'password'
                        ? mode === 'login'
                          ? 'current-password'
                          : 'new-password'
                        : f.key === 'email'
                          ? 'email'
                          : 'off'
                    }
                    value={values[f.key] || ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                  {f.type === 'password' && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={visible ? 'پنهان کردن رمز' : 'نمایش رمز'}
                      onClick={() => setVisible(!visible)}
                    >
                      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  )}
                </div>
              </label>
            ))}
            <button className="btn btn-primary auth-submit" disabled={busy}>
              {busy
                ? 'در حال پردازش…'
                : mode === 'login'
                  ? 'ورود به فضای کاری'
                  : mode === 'register'
                    ? 'ساخت سازمان'
                    : mode === 'accept-invitation'
                      ? 'پذیرش دعوت'
                      : 'ادامه'}
              <ArrowLeft size={18} />
            </button>
          </form>
          <div className="auth-links">
            <Link href={mode === 'login' ? '/register' : '/login'}>
              {mode === 'login' ? 'ساخت حساب و سازمان جدید' : 'بازگشت به ورود'}
            </Link>
            {mode === 'login' && <Link href="/forgot-password">رمز را فراموش کرده‌ام</Link>}
          </div>
          <div className="auth-trust">
            <ShieldCheck size={18} />
            <span>اطلاعات هر سازمان، در محدودهٔ دسترسی همان سازمان</span>
          </div>
        </div>
        <footer>تراز · حسابِ همه‌چیز، روشن</footer>
      </section>
      <aside className="auth-story">
        <span>تراز / فضای مالی شما</span>
        <div>
          <span className="eyebrow">از اولین سند تا تصویر بزرگ‌تر</span>
          <h2>
            همهٔ حساب‌ها.
            <br />
            یک تصویر روشن.
          </h2>
          <p>
            از خرید و فروش تا حقوق و گزارش‌های مالی؛
            <br />
            هر ثبت، بخشی از یک روایت دقیق است.
          </p>
          <div className="auth-ledger-art" aria-hidden="true">
            {['ثبت', 'تطبیق', 'گزارش'].map((t, i) => (
              <div key={t}>
                <span>۰{i + 1}</span>
                <strong>{t}</strong>
                <i style={{ width: `${45 + i * 20}%` }} />
              </div>
            ))}
          </div>
        </div>
        <small>طراحی‌شده برای تیم‌هایی که با دقت رشد می‌کنند.</small>
      </aside>
    </main>
  );
}
