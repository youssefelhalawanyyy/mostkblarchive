"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Library, Loader2, AlertTriangle, Sun, Moon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, configured, signIn, signUp } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (mode === "login") await signIn(email.trim(), password);
      else await signUp(email.trim(), password, displayName.trim());
      router.replace("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("auth/email-already-in-use")) {
        setError("هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول.");
      } else if (msg.includes("auth/weak-password")) {
        setError("كلمة المرور يجب أن تكون 6 أحرف على الأقل.");
      } else if (msg.includes("auth/operation-not-allowed")) {
        setError("يرجى تفعيل Email/Password من Firebase Console → Authentication.");
      } else {
        setError("بيانات الدخول غير صحيحة أو تعذر الاتصال بـ Firebase.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-grid relative flex min-h-screen items-center justify-center bg-bg p-4">
      <button
        type="button"
        onClick={toggleTheme}
        className="btn btn-secondary btn-icon fixed end-5 top-5"
        aria-label={theme === "dark" ? "تفعيل وضع النهار" : "تفعيل الوضع الليلي"}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="card w-full max-w-[400px] p-7 shadow-pop">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-inverse text-inverse-fg">
            <Library className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="mt-4 font-display text-xl font-bold tracking-tight text-fg">
            الأرشيف الإلكتروني الذكي
          </h1>
          <p className="mt-1 text-[12.5px] text-muted">
            منظومة إدارة المراسلات الرسمية (الصادر والوارد)
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 rounded-lg border border-line bg-bg/60 p-1 text-[12.5px] font-medium">
          {(["login", "register"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError("");
              }}
              className={cn(
                "rounded-md py-1.5 transition-all",
                mode === m
                  ? "bg-panel text-fg shadow-card"
                  : "text-muted hover:text-fg"
              )}
            >
              {m === "login" ? "تسجيل الدخول" : "إنشاء حساب"}
            </button>
          ))}
        </div>

        {!configured && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-wared/30 bg-wared/10 p-3 text-xs text-wared">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>يرجى التحقق من إعدادات Firebase في ملف .env.local.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === "register" && (
            <div>
              <label className="label">الاسم الكامل</label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="مثال: أحمد محمد"
                className="input"
              />
            </div>
          )}

          <div>
            <label className="label">البريد الإلكتروني</label>
            <input
              type="email"
              dir="ltr"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@organization.gov.eg"
              className="input"
            />
          </div>

          <div>
            <label className="label">كلمة المرور</label>
            <input
              type="password"
              dir="ltr"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="input"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !configured}
            className="btn btn-primary btn-lg w-full"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                جاري التحقق…
              </>
            ) : mode === "login" ? (
              "تسجيل الدخول"
            ) : (
              "إنشاء الحساب والدخول"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
