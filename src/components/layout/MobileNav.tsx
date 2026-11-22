"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Archive, Sparkles, FolderTree } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

/**
 * Native-style bottom tab bar shown on mobile / installed phone PWA screens.
 */
export function MobileNav() {
  const pathname = usePathname();
  const { profile } = useAuth();
  const canCreate = profile?.role === "admin" || profile?.role === "editor";

  const items = [
    { href: "/", label: "الرئيسية", icon: LayoutDashboard, visible: true },
    { href: "/archive", label: "الأرشيف", icon: Archive, visible: true },
    { href: "/intake", label: "تسجيل", icon: Sparkles, visible: canCreate },
    { href: "/taxonomy", label: "الملفات", icon: FolderTree, visible: true },
  ].filter((i) => i.visible);

  return (
    <nav
      aria-label="التنقل السفلي"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-panel/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid h-14 grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
                  active ? "text-fg" : "text-faint hover:text-muted"
                )}
              >
                <Icon className={cn("h-4 w-4", active && "text-fg")} aria-hidden />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

