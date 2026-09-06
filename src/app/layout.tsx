import type { Metadata } from 'next';
import '@fontsource-variable/vazirmatn';
import './globals.css';
import './refinement.css';
import './services.css';
export const metadata: Metadata = {
  title: { default: 'تراز | حسابِ همه‌چیز، روشن', template: '%s | تراز' },
  description: 'فضای یکپارچهٔ حسابداری، مدیریت مالی و کسب‌وکار تراز',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
