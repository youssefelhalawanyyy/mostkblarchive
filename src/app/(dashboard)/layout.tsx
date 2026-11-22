"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import { Loader2, ShieldAlert, Library } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseDb } from "@/lib/firebase/client";
import dynamic from "next/dynamic";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNav } from "@/components/layout/MobileNav";

const CommandPalette = dynamic(
  () => import("@/components/layout/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false }
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, profile, loading, configured, signOut } = useAuth();
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!configured || !user || !profile?.active) return;
    const q = query(
      collection(getFirebaseDb(), "documents"),
      where("syncedToLegacy", "==", false),
      limit(25)
    );
    return onSnapshot(
      q,
      (snap) => setPendingSyncCount(snap.size),
      () => setPendingSyncCount(0)
    );
  }, [configured, user, profile?.active]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-inverse text-inverse-fg">
          <Library className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          جاري تحميل منظومة الأرشيف…
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (profile && !profile.active) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <div className="card max-w-md p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-wared/10 text-wared">
            <ShieldAlert className="h-5 w-5" aria-hidden />
          </div>
          <h2 className="mt-4 font-display text-lg font-bold">الحساب غير مفعّل</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            حسابك (<bdi dir="ltr">{user.email}</bdi>) بانتظار التفعيل من مدير النظام.
          </p>
          <button type="button" onClick={() => signOut()} className="btn btn-secondary mt-6">
            تسجيل الخروج
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        pendingSyncCount={pendingSyncCount}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onOpenCommand={() => setCommandOpen(true)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />
        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 pb-20 pt-5 lg:px-8 lg:py-6">
          {children}
        </main>
      </div>
      <MobileNav />
      {commandOpen && (
        <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
      )}
    </div>
  );
}
