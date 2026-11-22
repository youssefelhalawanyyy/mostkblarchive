import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight text-fg">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  className,
  children,
  as: Tag = "div",
}: {
  className?: string;
  children: React.ReactNode;
  as?: "div" | "section" | "article";
}) {
  return <Tag className={cn("card", className)}>{children}</Tag>;
}

export function CardHeader({
  title,
  description,
  action,
  icon: Icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line px-5 py-3.5",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-faint" aria-hidden />}
        <div className="min-w-0">
          <h2 className="truncate text-[13.5px] font-semibold text-fg">{title}</h2>
          {description && <p className="truncate text-xs text-faint">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-raised">
        <Icon className="h-5 w-5 text-faint" aria-hidden />
      </div>
      <p className="mt-4 text-sm font-semibold text-fg">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = (name || "؟")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line bg-raised text-xs font-semibold text-fg",
        className
      )}
    >
      {initials}
    </span>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  const tones = {
    ok: "text-ok bg-ok/10 ring-ok/20",
    warn: "text-wared bg-wared/10 ring-wared/20",
    danger: "text-danger bg-danger/10 ring-danger/20",
    neutral: "text-muted bg-raised ring-line",
  } as const;
  const dot = {
    ok: "bg-ok",
    warn: "bg-wared",
    danger: "bg-danger",
    neutral: "bg-faint",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset",
        tones[tone]
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot[tone])} aria-hidden />
      {children}
    </span>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string; count?: number; icon?: LucideIcon }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-center gap-1 border-b border-line", className)}>
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative -mb-px flex items-center gap-2 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition-colors",
              active
                ? "border-fg text-fg"
                : "border-transparent text-muted hover:text-fg"
            )}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {item.label}
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "num rounded-md px-1.5 text-[11px]",
                  active ? "bg-fg/10 text-fg" : "bg-raised text-faint"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

