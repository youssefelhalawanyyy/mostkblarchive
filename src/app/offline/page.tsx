"use client";

import { WifiOff, RefreshCw, Library } from "lucide-react";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg p-6 text-center">
      <div className="card max-w-md p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-raised text-fg">
          <Library className="h-6 w-6" aria-hidden />
        </div>
        <div className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-wared/10 px-3 py-1 text-xs font-medium text-wared">
          <WifiOff className="h-3.5 w-3.5" aria-hidden />
          <span>لا يوجد اتصال بالإنترنت</span>
        </div>
        <h1 className="mt-4 font-display text-lg font-bold text-fg">
          أنت في وضع عدم الاتصال
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          تحقق من اتصالك بالشبكة ثم أعد المحاولة. المستندات التي فتحتها سابقاً تبقى
          محفوظة مؤقتاً على جهازك.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn btn-primary mt-6 w-full"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}

