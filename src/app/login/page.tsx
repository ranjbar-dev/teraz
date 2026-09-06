'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Mail,
  LockKeyhole,
  Check,
  ShieldCheck,
  ArrowUpLeft,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Logo } from '@/components/icons';
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@taraz.app');
  const [password, setPassword] = useState('Taraz1405!');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [role, setRole] = useState('admin');
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-main">
        <Logo />
        <div className="login-form-wrap">
          <span className="eyebrow">به فضای کاری‌تان خوش آمدید</span>
          <h1>
            حساب‌های روشن.
            <br />
            خیال آسوده.
          </h1>
          <p>برای مدیریت کسب‌وکارتان، وارد تراز شوید.</p>
          <form onSubmit={submit}>
            {error && (
              <div className="form-error" role="alert">
                <AlertCircle size={17} />
                {error}
              </div>
            )}
            <label className="field">
              <span>ایمیل</span>
              <div className="login-input">
                <Mail size={18} />
                <input
                  type="email"
                  dir="ltr"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  aria-label="ایمیل"
                />
              </div>
            </label>
            <label className="field">
              <span>رمز عبور</span>
              <div className="login-input">
                <LockKeyhole size={18} />
                <input
                  type={visible ? 'text' : 'password'}
                  dir="ltr"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  aria-label="رمز عبور"
                />
                <button
                  type="button"
                  aria-label={visible ? 'پنهان کردن رمز' : 'نمایش رمز'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <button className="btn btn-primary login-submit" disabled={busy || !hydrated}>
              {busy ? 'در حال ورود…' : 'ورود به فضای کاری'}
              <ArrowLeft size={19} />
            </button>
          </form>
          <div className="demo-login">
            <span>
              <span className="live-dot" /> یک دور در تراز بزنید
            </span>
            <p>یک نقش انتخاب کنید؛ اطلاعات ورود آماده است.</p>
            <div className="demo-roles">
              {[
                { key: 'admin', label: 'مدیر' },
                { key: 'accountant', label: 'حسابدار' },
                { key: 'viewer', label: 'مشاهده‌گر' },
              ].map((r) => (
                <button
                  key={r.key}
                  className={role === r.key ? 'selected' : ''}
                  onClick={() => {
                    setRole(r.key);
                    setEmail(`${r.key}@taraz.app`);
                    setPassword('Taraz1405!');
                  }}
                >
                  {role === r.key && <Check size={14} />} {r.label}
                </button>
              ))}
            </div>
            <small>
              رمز آزمایشی: <b dir="ltr">Taraz1405!</b>
            </small>
          </div>
        </div>
        <footer>ساخته‌شده برای نظم، شفافیت و رشد.</footer>
      </section>
      <aside className="login-visual">
        <div className="login-visual-top">
          <span>حسابِ همه‌چیز، روشن</span>
          <span>تراز / ۱۴۰۵</span>
        </div>
        <div className="login-visual-title">
          <span className="login-tag">
            <i /> همراه رشد کسب‌وکار شما
          </span>
          <h2>
            پشت هر تصمیم خوب،
            <br />
            یک تصویر روشن است.
          </h2>
          <p>
            از اولین فاکتور تا آخرین گزارش؛
            <br />
            تمام جریان مالی کسب‌وکارتان، در یک نگاه.
          </p>
        </div>
        <div className="login-art">
          <div className="login-art-card">
            <div>
              <span>وضعیت کسب‌وکار</span>
              <span className="art-status">
                همه‌چیز مرتب است <CheckCircle2 size={13} />
              </span>
            </div>
            <strong>یک قدم جلوتر.</strong>
            <small>فروش، هزینه و رشد؛ با دیدی روشن‌تر</small>
            <div className="login-bars">
              {[32, 47, 40, 64, 57, 78, 70, 93].map((h, i) => (
                <span key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
            <div className="art-bottom">
              <span>از شروع</span>
              <span>
                تا رشد <ArrowUpLeft size={16} />
              </span>
            </div>
          </div>
          <div className="floating-check">
            <CheckCircle2 size={28} />
            <span>
              همهٔ حساب‌ها، یک‌جا<small>مستقل برای هر شرکت و شعبه</small>
            </span>
          </div>
        </div>
        <div className="login-visual-footer">
          <ShieldCheck size={20} />
          <span>دقیق در جزئیات. ساده در استفاده.</span>
          <span>01 / 01</span>
        </div>
      </aside>
    </main>
  );
}
