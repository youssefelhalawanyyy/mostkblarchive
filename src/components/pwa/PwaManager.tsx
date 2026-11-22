"use client";

import { useEffect, useState } from "react";
import { Download, WifiOff, X, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Registers the PWA Service Worker, monitors online/offline connectivity,
 * and surfaces a clean native Install App prompt on Desktop, Android, and iOS.
 */
export function PwaManager() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isIosInstallable, setIsIosInstallable] = useState(false);

  useEffect(() => {
    // 1. Register Service Worker in production or localhost
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    // 2. Connectivity listeners
    const updateOnline = () => setIsOffline(!navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    // 3. Chromium / Edge / Android native install prompt
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // 4. Detect iOS Safari (not yet in standalone mode)
    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator &&
        Boolean((window.navigator as { standalone?: boolean }).standalone));

    if (isIos && !isStandalone && !window.localStorage.getItem("mostkbl_pwa_dismissed")) {
      setIsIosInstallable(true);
    }

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallEvent(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setIsIosInstallable(false);
    try {
      window.localStorage.setItem("mostkbl_pwa_dismissed", "1");
    } catch {
      // ignore
    }
  };

  return (
    <>
      {/* Offline Connectivity Pill */}
      {isOffline && (
        <div
          role="status"
          className="fixed bottom-4 start-4 z-50 flex items-center gap-2 rounded-full border border-wared/40 bg-panel px-4 py-2 text-xs font-medium text-wared shadow-pop"
        >
          <WifiOff className="h-3.5 w-3.5" aria-hidden />
          <span>وضع عدم الاتصال — يتم الحفظ والمزامنة تلقائياً عند عودة الشبكة</span>
        </div>
      )}

      {/* Install PWA Banner (Desktop / Android) */}
      {installEvent && !dismissed && (
        <div className="fixed bottom-4 end-4 z-50 flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 shadow-pop">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-fg">تثبيت تطبيق الأرشيف الذكي</p>
            <p className="text-[11.5px] text-muted">
              وصول فوري من سطح المكتب أو الهاتف كتطبيق مستقل
            </p>
          </div>
          <button type="button" onClick={handleInstall} className="btn btn-primary btn-sm shrink-0">
            <Download className="h-3.5 w-3.5" aria-hidden />
            تثبيت
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="إغلاق"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* iOS Safari Add-to-Home-Screen Hint */}
      {isIosInstallable && !dismissed && !installEvent && (
        <div className="fixed bottom-4 inset-x-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 shadow-pop">
          <Share className="h-4 w-4 shrink-0 text-sader" aria-hidden />
          <p className="flex-1 text-[12px] text-fg">
            لتثبيت التطبيق على iPhone: اضغط زر <strong>المشاركة</strong> ثم{" "}
            <strong>إضافة إلى الشاشة الرئيسية</strong>.
          </p>
          <button
            type="button"
            onClick={handleDismiss}
            className="btn btn-ghost btn-icon btn-sm"
            aria-label="إغلاق"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </>
  );
}

