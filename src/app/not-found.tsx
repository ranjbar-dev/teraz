import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="loading-screen" dir="rtl">
      <span className="error-code">۴۰۴</span>
      <h1>این صفحه پیدا نشد.</h1>
      <p>ممکن است آدرس تغییر کرده باشد یا رکورد دیگر موجود نباشد.</p>
      <Link className="btn btn-primary" href="/dashboard">
        بازگشت به داشبورد
      </Link>
    </div>
  );
}
