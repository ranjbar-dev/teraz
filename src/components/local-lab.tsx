'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FlaskConical, RefreshCw } from 'lucide-react';
import { Item, SmartTable, format, day, request, stateLabel } from './saas-shared';
const mailKind = (kind: string) =>
  (
    ({
      'verify-email': 'تأیید ایمیل',
      'reset-password': 'بازیابی رمز',
      'accept-invitation': 'دعوت به سازمان',
    }) as Item
  )[kind] || kind;
export function LocalLab({ payment = false }: { payment?: boolean }) {
  const [data, setData] = useState<Item | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const endpoint = () =>
    payment ? 'billing/local/' + new URL(location.href).searchParams.get('id') : 'local-mail';
  async function refresh() {
    try {
      setError('');
      setData(await request(endpoint()));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, [payment]);
  async function act(outcome: string) {
    setBusy(true);
    setError('');
    try {
      const result = await request(endpoint(), 'POST', { outcome });
      setMessage(
        result.ok
          ? 'اشتراک در محیط محلی تمدید شد. هیچ پولی جابه‌جا نشد.'
          : 'سناریوی ناموفق ثبت شد و اعتبار اشتراک تغییر نکرد.',
      );
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="local-lab">
      <header className="panel form-panel">
        <span className="eyebrow">
          <FlaskConical size={20} /> آزمایشگاه محلی تراز
        </span>
        <h1>{payment ? 'آزمایش پرداخت اشتراک' : 'صندوق ایمیل آزمایشی'}</h1>
        <p className="muted">
          {payment
            ? 'یک نتیجه انتخاب کنید و اثر آن را در اشتراک ببینید. اطلاعات کارت بانکی نیاز نیست.'
            : 'پیام‌ها فقط روی همین دستگاه ذخیره می‌شوند. مدیر کل پیام‌های همهٔ کاربران و اعضا فقط پیام‌های حساب خود را می‌بینند.'}
        </p>
        <div className="saas-form-actions">
          <Link
            className="btn"
            href={payment ? '/subscription' : data?.superAdmin ? '/platform' : '/profile'}
          >
            بازگشت به حساب
          </Link>
          <button className="btn" onClick={refresh}>
            <RefreshCw size={16} />
            به‌روزرسانی
          </button>
        </div>
      </header>
      {error && (
        <div className="form-error" role="alert">
          {error}
          <Link href="/login"> ورود به حساب</Link>
        </div>
      )}
      {message && (
        <p className="success-note" role="status">
          {message}
        </p>
      )}
      {!data && !error && <p>در حال دریافت…</p>}
      {payment && data && (
        <section className="panel form-panel">
          <span className="eyebrow">شبیه‌ساز محلی · بدون تراکنش بانکی</span>
          <h2>{data.payment.plan.name}</h2>
          <h3>{format(data.payment.amount)} ریال</h3>
          <p>
            {format(data.payment.durationDays)} روز اعتبار · {stateLabel(data.payment.status)}
          </p>
          <p dir="ltr">{data.payment.reference || data.payment.id}</p>
          {data.payment.status === 'PENDING' ? (
            <div className="saas-form-actions">
              <button disabled={busy} className="btn btn-primary" onClick={() => act('success')}>
                پرداخت موفق آزمایشی
              </button>
              <button disabled={busy} className="btn" onClick={() => act('failure')}>
                پرداخت ناموفق آزمایشی
              </button>
              <button disabled={busy} className="btn" onClick={() => act('cancel')}>
                انصراف از پرداخت
              </button>
            </div>
          ) : (
            <Link className="btn btn-primary" href="/subscription">
              مشاهدهٔ اشتراک و سوابق
            </Link>
          )}
        </section>
      )}
      {!payment && data && (
        <SmartTable
          title="پیام‌های محلی"
          rows={data.rows}
          columns={[
            { key: 'email', label: 'گیرنده' },
            {
              key: 'kind',
              label: 'نوع پیام',
              text: (r) => mailKind(r.kind),
              render: (r) => mailKind(r.kind),
            },
            {
              key: 'createdAt',
              label: 'تاریخ',
              text: (r) => day(r.createdAt),
              render: (r) => day(r.createdAt),
            },
          ]}
          action={(r) => (
            <Link className="btn btn-small" href={r.url}>
              باز کردن پیوند آزمایشی
            </Link>
          )}
        />
      )}
    </main>
  );
}
