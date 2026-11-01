import { Link, useLocation, useSearchParams } from "react-router-dom";
import { CalendarCheck2, Landmark, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type UnifiedPayrollSection = "attendance" | "payroll" | "settings";
export type UnifiedSettingsSubtab = "rates" | "workers" | "mappings";

export function resolveUnifiedPayrollSection(pathname: string, searchParams: URLSearchParams): {
  section: UnifiedPayrollSection;
  settingsSubtab: UnifiedSettingsSubtab;
} {
  const explicitSection = searchParams.get("section");
  const tab = searchParams.get("tab");

  if (pathname.startsWith("/production-attendance")) {
    if (explicitSection === "payroll" || tab === "runs" || tab === "payroll") {
      return { section: "payroll", settingsSubtab: "rates" };
    }
    if (
      explicitSection === "settings" ||
      tab === "rates" ||
      tab === "mappings" ||
      tab === "workers" ||
      tab === "banks" ||
      tab === "policies"
    ) {
      const sub = tab==='mappings'||searchParams.get('subtab')==='mappings'?'mappings':
        searchParams.get("subtab") === "workers" ||
        tab === "workers" ||
        tab === "banks" ||
        tab === "policies"
          ? "workers"
          : "rates";
      return { section: "settings", settingsSubtab: sub };
    }
    return { section: "attendance", settingsSubtab: "rates" };
  }

  // On /payroll-settings
  if (tab === "runs" || tab === "adjustments" || tab === "overview" || !tab) {
    return { section: "payroll", settingsSubtab: "rates" };
  }
  if (tab === 'mappings')return {section:'settings',settingsSubtab:'mappings'};
  if (tab === "rates") {
    return { section: "settings", settingsSubtab: "rates" };
  }
  return { section: "settings", settingsSubtab: "workers" };
}

export function buildUnifiedSectionHref(
  target: UnifiedPayrollSection,
  searchParams: URLSearchParams,
  subtab?: UnifiedSettingsSubtab,
): string {
  const next = new URLSearchParams();
  const month = searchParams.get("month");
  const location = searchParams.get("location");
  const date = searchParams.get("date");

  if (month) next.set("month", month);
  if (location && location !== "ALL") next.set("location", location);

  if (target === "attendance") {
    if (date) next.set("date", date);
    const qs = next.toString();
    return `/production-attendance${qs ? `?${qs}` : ""}`;
  }

  if (target === "payroll") {
    next.set("tab", "runs");
    return `/payroll-settings?${next.toString()}`;
  }

  const resolvedSubtab = subtab ?? "rates";
  next.set("tab", resolvedSubtab);
  return `/payroll-settings?${next.toString()}`;
}

export default function UnifiedAttendancePayrollTabs({
  activeSection,
  actions,
}: {
  activeSection?: UnifiedPayrollSection;
  actions?: React.ReactNode;
}) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const resolved = resolveUnifiedPayrollSection(location.pathname, searchParams);
  const currentSection = activeSection ?? resolved.section;

  const tabs: Array<{
    id: UnifiedPayrollSection;
    label: string;
    shortLabel: string;
    href: string;
    Icon: typeof CalendarCheck2;
  }> = [
    {
      id: "attendance",
      label: "1. Chấm công & Sản lượng",
      shortLabel: "Chấm công",
      href: buildUnifiedSectionHref("attendance", searchParams),
      Icon: CalendarCheck2,
    },
    {
      id: "payroll",
      label: "2. Bảng lương tháng",
      shortLabel: "Bảng lương",
      href: buildUnifiedSectionHref("payroll", searchParams),
      Icon: Landmark,
    },
    {
      id: "settings",
      label: "3. Đơn giá & Nhân sự",
      shortLabel: "Đơn giá & Nhân sự",
      href: buildUnifiedSectionHref("settings", searchParams, resolved.settingsSubtab),
      Icon: Settings2,
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-2 shadow-sm">
      <nav
        aria-label="Trung tâm Chấm công & Tính lương"
        className="grid w-full grid-cols-3 gap-1 rounded-lg bg-muted/60 p-1 sm:w-auto sm:inline-flex"
      >
        {tabs.map(({ id, label, shortLabel, href, Icon }) => {
          const isActive = currentSection === id;
          return (
            <Link
              key={id}
              to={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/80 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </Link>
          );
        })}
      </nav>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}
