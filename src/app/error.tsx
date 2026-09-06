'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="loading-screen" dir="rtl">
      <h1>بارگذاری صفحه کامل نشد.</h1>
      <p>دوباره تلاش کنید.</p>
      <button className="btn btn-primary" onClick={reset}>
        تلاش دوباره
      </button>
    </div>
  );
}
