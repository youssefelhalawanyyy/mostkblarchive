"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Archive,
  Sparkles,
  FolderTree,
  Users,
  LogOut,
  Library,
  X,
  Bot,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABELS, type UserRole } from "@/lib/types";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface SidebarProps {
  pendingSyncCount: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "لوحة المتابعة", icon: LayoutDashboard },
  { href: "/archive", label: "أرشيف الصادر والوارد", icon: Archive },
  {
    href: "/intake",
    label: "تسجيل مستند جديد",
    icon: Sparkles,
    roles: ["admin", "editor"],
  },
  { href: "/assistant", label: "اسأل الأرشيف", icon: Bot },
  { href: "/taxonomy", label: "الملفات والجهات", icon: FolderTree },
  { href: "/users", label: "المستخدمون", icon: Users, roles: ["admin"] },
];

export function Sidebar({
  pendingSyncCount,
  mobileOpen = false,
  onCloseMobile,
}: SidebarProps) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const role: UserRole = profile?.role || "viewer";

  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

  const content = (
    <aside className="flex h-full w-[232px] flex-col border-e border-line bg-panel">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-inverse text-inverse-fg">
          <Library className="h-3.5 w-3.5" aria-hidden />
        </div>
        <span className="truncate font-display text-[14px] font-bold tracking-tight text-fg">
          الأرشيف الذكي
        </span>
        {onCloseMobile && mobileOpen && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="btn btn-ghost btn-icon btn-sm ms-auto lg:hidden"
            aria-label="إغلاق القائمة"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Clean Single-List Navigation */}
      <nav aria-label="القائمة الرئيسية" className="flex-1 px-2.5 py-3">
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onCloseMobile}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13px] transition-colors",
                    active
                      ? "bg-raised font-semibold text-fg"
                      : "text-muted hover:bg-raised/60 hover:text-fg"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-fg" : "text-faint"
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Compact Sync Indicator */}
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-2 text-[11.5px] text-faint">
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              pendingSyncCount > 0 ? "bg-wared" : "bg-ok"
            )}
            aria-hidden
          />
          <span className="truncate">
            {pendingSyncCount > 0
              ? `${pendingSyncCount} بانتظار مزامنة السيرفر`
              : "السيرفر المحلي متزامن"}
          </span>
        </div>
      </div>

      {/* User Footer */}
      {profile && (
        <div className="flex items-center gap-2.5 border-t border-line px-3.5 py-3">
          <Avatar name={profile.displayName} className="h-7 w-7 text-[11px]" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[12px] font-semibold text-fg">
              {profile.displayName}
            </p>
            <p className="truncate text-[11px] text-faint">
              {ROLE_LABELS[profile.role]}
            </p>
          </div>
          <button
            type="button"
            onClick={() => signOut()}
            className="btn btn-ghost btn-icon btn-sm"
            title="تسجيل الخروج"
            aria-label="تسجيل الخروج"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </aside>
  );

  return (
    <>
      <div className="hidden lg:sticky lg:top-0 lg:block lg:h-screen">
        {content}
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full shadow-pop">{content}</div>
        </div>
      )}
    </>
  );
}
