import { WorkspaceServices } from '@/components/workspace-services';
import { PayrollExports } from '@/components/payroll-exports';
import { notFound } from 'next/navigation';
import { modules, reports } from '@/lib/modules';
import { Dashboard } from '@/components/dashboard';
import { ModuleList, EntityDetail, EntityEditor } from '@/components/modules';
import { ReportsIndex, ReportView } from '@/components/reports';
import { Settings, Activity, Help } from '@/components/settings';
type Props = { params: Promise<{ slug: string[] }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const title =
    modules.find((m) => m.key === slug[0])?.title ||
    (
      {
        dashboard: 'داشبورد',
        reports: 'گزارش‌های مالی',
        settings: 'تنظیمات',
        help: 'راهنما',
        activity: 'تاریخچه فعالیت‌ها',
      } as Record<string, string>
    )[slug[0]] ||
    'صفحه';
  return { title };
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const [key, id, action] = slug;
  if (key === 'payroll-exports' && slug.length === 1) return <PayrollExports />;
  if (
    ['subscription', 'profile', 'integrations', 'payroll-rules', 'period-close'].includes(key) &&
    slug.length === 1
  )
    return <WorkspaceServices section={key} />;
  if (key === 'dashboard' && slug.length === 1) return <Dashboard />;
  if (key === 'reports' && slug.length <= 2) {
    if (!id) return <ReportsIndex />;
    if (reports.some((r) => r.key === id)) return <ReportView reportKey={id} />;
    notFound();
  }
  if (key === 'settings' && slug.length === 1) return <Settings />;
  if (key === 'activity' && slug.length === 1) return <Activity />;
  if (key === 'help' && slug.length === 1) return <Help />;
  const mod = modules.find((m) => m.key === key);
  if (!mod || slug.length > 3 || (action && action !== 'edit')) notFound();
  if (!id) return <ModuleList mod={mod} />;
  if (id === 'new' && !action) return <EntityEditor mod={mod} />;
  if (action === 'edit') return <EntityEditor mod={mod} id={id} />;
  return <EntityDetail mod={mod} id={id} />;
}
