import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WorkspaceStatusPill {
  id: string;
  label: string;
  count?: string | number;
  tone?: "default" | "warning" | "danger" | "success" | "info";
  active?: boolean;
  onClick?: () => void;
  icon?: LucideIcon;
}

const toneClasses: Record<NonNullable<WorkspaceStatusPill["tone"]>, string> = {
  default: "border-border bg-card text-foreground hover:bg-muted/60",
  warning: "border-amber-200 bg-amber-50/70 text-amber-900 hover:bg-amber-100/70",
  danger: "border-rose-200 bg-rose-50/70 text-rose-900 hover:bg-rose-100/70",
  success: "border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100/70",
  info: "border-sky-200 bg-sky-50/70 text-sky-900 hover:bg-sky-100/70",
};

const activeToneClasses: Record<NonNullable<WorkspaceStatusPill["tone"]>, string> = {
  default: "border-primary bg-primary text-primary-foreground shadow-sm",
  warning: "border-amber-600 bg-amber-600 text-white shadow-sm",
  danger: "border-rose-600 bg-rose-600 text-white shadow-sm",
  success: "border-emerald-600 bg-emerald-600 text-white shadow-sm",
  info: "border-sky-600 bg-sky-600 text-white shadow-sm",
};

export function WorkspaceCommandBar({
  title,
  subtitle,
  badge,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card px-3.5 py-2.5 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-1.5">{actions}</div>
        )}
      </div>
      {children && <div className="mt-2.5 border-t pt-2.5">{children}</div>}
    </div>
  );
}

export function StatusFilterStrip({
  items,
  rightSlot,
  ariaLabel = "Bộ lọc trạng thái nhanh",
  className,
}: {
  items: WorkspaceStatusPill[];
  rightSlot?: ReactNode;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2",
        className,
      )}
      role="group"
      aria-label={ariaLabel}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const tone = item.tone ?? "default";
          const isInteractive = Boolean(item.onClick);
          return (
            <button
              key={item.id}
              type="button"
              disabled={!isInteractive}
              aria-pressed={item.active}
              onClick={item.onClick}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors sm:text-sm",
                item.active ? activeToneClasses[tone] : toneClasses[tone],
                !isInteractive && "cursor-default",
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                    item.active
                      ? "bg-white/20 text-current"
                      : "bg-background/80 text-foreground",
                  )}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {rightSlot && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {rightSlot}
        </div>
      )}
    </div>
  );
}

export interface WorkspaceWorkflowStep {
  id: string;
  label: string;
  count?: string | number;
  active?: boolean;
  onClick?: () => void;
}

/** A compact, touch-friendly overview of the production flow. */
export function WorkflowStepStrip({
  items,
  ariaLabel = "Quy trình sản xuất",
  className,
}: {
  items: WorkspaceWorkflowStep[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <nav
      className={cn("overflow-x-auto rounded-lg border bg-card p-2", className)}
      aria-label={ariaLabel}
    >
      <ol className="flex min-w-max items-stretch gap-1.5 sm:gap-2">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-stretch">
            <button
              type="button"
              aria-current={item.active ? "step" : undefined}
              aria-pressed={item.active}
              onClick={item.onClick}
              className={cn(
                "flex min-h-12 min-w-[9.5rem] items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors sm:min-w-[10.5rem]",
                item.active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background hover:border-primary/50 hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                  item.active
                    ? "bg-white/20 text-current"
                    : "bg-muted text-foreground",
                )}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block whitespace-normal text-xs font-semibold leading-tight sm:text-sm">
                  {item.label}
                </span>
                {item.count !== undefined && (
                  <span
                    className={cn(
                      "mt-0.5 block text-sm font-bold tabular-nums",
                      item.active
                        ? "text-primary-foreground"
                        : "text-foreground",
                    )}
                  >
                    {item.count} lô
                  </span>
                )}
              </span>
            </button>
            {index < items.length - 1 && (
              <span
                aria-hidden="true"
                className="hidden items-center px-0.5 text-muted-foreground sm:flex"
              >
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
