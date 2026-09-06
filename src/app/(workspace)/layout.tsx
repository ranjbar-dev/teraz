import { AppProvider } from '@/components/provider';
import { Shell } from '@/components/shell';
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <a className="skip-link" href="#main-content">
        رفتن به محتوای اصلی
      </a>
      <Shell>{children}</Shell>
    </AppProvider>
  );
}
