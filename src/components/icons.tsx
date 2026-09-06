import {
  LayoutDashboard,
  Users,
  Package,
  Warehouse,
  ReceiptText,
  Wallet,
  Landmark,
  ArrowLeftRight,
  BookOpen,
  Network,
  UserRound,
  Building2,
  Factory,
  FolderKanban,
  ShieldCheck,
  CalendarDays,
  Coins,
  GitBranch,
  FlaskConical,
  TrendingDown,
  TrendingUp,
  ChartNoAxesCombined,
  Scale,
  Columns3,
  CircleCheck,
  type LucideProps,
} from 'lucide-react';
const icons: Record<string, React.ComponentType<LucideProps>> = {
  dashboard: LayoutDashboard,
  users: Users,
  package: Package,
  warehouse: Warehouse,
  receipt: ReceiptText,
  wallet: Wallet,
  landmark: Landmark,
  arrows: ArrowLeftRight,
  book: BookOpen,
  tree: GitBranch,
  user: UserRound,
  building: Building2,
  factory: Factory,
  folder: FolderKanban,
  shield: ShieldCheck,
  calendar: CalendarDays,
  coins: Coins,
  network: Network,
  flask: FlaskConical,
  down: TrendingDown,
  up: TrendingUp,
  chart: ChartNoAxesCombined,
  scale: Scale,
  columns: Columns3,
  check: CircleCheck,
};
export function Icon({ name, ...props }: LucideProps & { name: string }) {
  const Component = icons[name] || ReceiptText;
  return <Component strokeWidth={1.7} {...props} />;
}
export function Logo({ small = false }: { small?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark">
        <svg width="29" height="29" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path
            d="M6 8h20M16 8v18M7 26h18M7 10l-4 9h8L7 10ZM25 10l-4 9h8l-4-9Z"
            stroke="currentColor"
            strokeWidth="2.3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!small && (
        <span>
          <strong>
            تراز<span className="brand-dot">.</span>
          </strong>
          <small>حسابِ همه‌چیز، روشن</small>
        </span>
      )}
    </div>
  );
}
