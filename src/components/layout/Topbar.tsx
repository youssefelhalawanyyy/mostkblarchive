"use client";

import { usePathname } from "next/navigation";
import { Search, Sun, Moon, Menu } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";

interface TopbarProps {
  onOpenCommand: () => void;
  onOpenMobileMenu: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  "/": "لوحة المتابعة",
  "/archive": "أرشيف الصادر والوارد",
  "/intake": "تسجيل مستند جديد",
  "/assistant": "اسأل الأرشيف",
  "/taxonomy": "الملفات والجهات",
  "/users": "المستخدمون والصلاحيات",
};

export function Topbar({ onOpenCommand, onOpenMobileMenu }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const key = Object.keys(PAGE_TITLES)
    .filter((k) => (k === "/" ? pathname === "/" : pathname.startsWith(k)))
    .sort((a, b) => b.length - a.length)[0];
  const title = PAGE_TITLES[key || "/"];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur-xl lg:px-8">
      <button
        type="button"
        onClick={onOpenMobileMenu}
        className="btn btn-secondary btn-icon btn-sm lg:hidden"
        aria-label="فتح القائمة"
      >
        <Menu className="h-4 w-4" />
      </button>

      <h2 className="hidden font-display text-[14px] font-semibold text-fg sm:block">
        {title}
      </h2>

      <div className="ms-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenCommand}
          className="flex h-8 w-52 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-[12.5px] text-faint transition-colors hover:border-line-strong hover:text-muted sm:w-64"
        >
          <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="flex-1 truncate text-start">بحث سريع…</span>
          <kbd className="kbd hidden sm:inline-flex" dir="ltr">
            ⌘K
          </kbd>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="btn btn-secondary btn-icon btn-sm"
          title={theme === "dark" ? "وضع النهار" : "الوضع الليلي"}
          aria-label={theme === "dark" ? "تفعيل وضع النهار" : "تفعيل الوضع الليلي"}
        >
          {theme === "dark" ? (
            <Sun className="h-3.5 w-3.5" />
          ) : (
            <Moon className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </header>
  );
}
