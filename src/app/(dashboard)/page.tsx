"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Files,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Folder,
  Sparkles,
  ArrowLeft,
  BarChart3,
  PieChart,
  Clock3,
  Inbox,
  BellRing,
  type LucideIcon,
} from "lucide-react";
import { fetchTaxonomy, subscribeToArchiveDocuments } from "@/lib/archive/queries";
import type { ArchiveDocument, FolderItem } from "@/lib/types";
import { DirectionBadge } from "@/components/ui/DirectionBadge";
import { LtrCode } from "@/components/ui/LtrCode";
import { Card, CardHeader, EmptyState, PageHeader, StatusPill } from "@/components/ui/primitives";
import { cn, getTodayIsoDate } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

function docDate(d: ArchiveDocument): string {
  const primary = d.direction === "sader" ? d.saderDate : d.waredDate;
  if (primary) return primary;
  const ts = d.createdAt as unknown as { toDate?: () => Date } | null;
  if (ts && typeof ts.toDate === "function") return ts.toDate().toISOString().slice(0, 10);
  return "";
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  return "مساء الخير";
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [docs, setDocs] = useState<ArchiveDocument[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchTaxonomy()
      .then((tax) => active && setFolders(tax.folders))
      .catch(console.error);
    const unsub = subscribeToArchiveDocuments(
      (all) => {
        if (!active) return;
        setDocs(all);
        setLoading(false);
      },
      (err) => {
        console.error("Dashboard live sync error:", err);
        if (active) setLoading(false);
      },
      50
    );
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const today = getTodayIsoDate();
  const monthPrefix = today.slice(0, 7);

  const stats = useMemo(() => {
    const sader = docs.filter((d) => d.direction === "sader");
    const wared = docs.filter((d) => d.direction === "wared");
    return {
      total: docs.length,
      saderToday: sader.filter((d) => docDate(d) === today).length,
      waredToday: wared.filter((d) => docDate(d) === today).length,
      saderMonth: sader.filter((d) => docDate(d).startsWith(monthPrefix)).length,
      waredMonth: wared.filter((d) => docDate(d).startsWith(monthPrefix)).length,
      pending: docs.filter((d) => !d.syncedToLegacy).length,
      needsFollowUp: docs.filter((d) => d.actionStatus === "pending_action").length,
      aiAssisted: docs.filter((d) => (d.aiExtractedFields || []).length > 0).length,
    };
  }, [docs, today, monthPrefix]);

  const series = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => isoDaysAgo(13 - i));
    return days.map((day) => ({
      day,
      sader: docs.filter((d) => d.direction === "sader" && docDate(d) === day).length,
      wared: docs.filter((d) => d.direction === "wared" && docDate(d) === day).length,
    }));
  }, [docs]);
  const seriesMax = Math.max(1, ...series.map((s) => Math.max(s.sader, s.wared)));

  const typeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    docs.forEach((d) => map.set(d.documentType || "أخرى", (map.get(d.documentType || "أخرى") || 0) + 1));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [docs]);

  const canCreate = profile?.role === "admin" || profile?.role === "editor";
  const firstName = (profile?.displayName || "").split(/\s+/)[0];
  const todayLabel = new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div>
      <PageHeader
        eyebrow={todayLabel}
        title={`${greeting()}${firstName ? `، ${firstName}` : ""}`}
        description="نظرة شاملة على حركة المراسلات الرسمية وحالة الأرشفة والمزامنة مع النظام القديم."
        actions={
          <>
            <Link href="/archive" className="btn btn-secondary">
              فتح الأرشيف
            </Link>
            {canCreate && (
              <Link href="/intake" className="btn btn-primary">
                <Sparkles className="h-4 w-4" aria-hidden />
                تسجيل مستند جديد
              </Link>
            )}
          </>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="إجمالي المستندات"
          value={stats.total}
          icon={Files}
          loading={loading}
          footer={`${stats.aiAssisted} مستند بمساعدة الذكاء الاصطناعي`}
        />
        <Kpi
          label="صادر اليوم"
          value={stats.saderToday}
          icon={ArrowDownLeft}
          tone="sader"
          loading={loading}
          footer={`${stats.saderMonth} خلال هذا الشهر`}
        />
        <Kpi
          label="وارد اليوم"
          value={stats.waredToday}
          icon={ArrowUpRight}
          tone="wared"
          loading={loading}
          footer={`${stats.waredMonth} خلال هذا الشهر`}
        />
        <Kpi
          label="بانتظار المزامنة"
          value={stats.pending}
          icon={RefreshCw}
          tone={stats.pending > 0 ? "wared" : "ok"}
          loading={loading}
          footer={stats.pending > 0 ? "سيتم الإرسال تلقائيًا للسيرفر" : "النظامان متطابقان"}
        />
      </div>

      {/* Follow-Up Action Alert Bar */}
      {stats.needsFollowUp > 0 && (
        <Link
          href="/archive?actionStatus=pending_action"
          className="card mt-4 flex items-center justify-between gap-4 border-wared/35 bg-wared/[0.06] px-5 py-3.5 transition-colors hover:bg-wared/10"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-wared/15 text-wared">
              <BellRing className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-[13px] font-bold text-fg">
                مراسلات تحتاج متابعة ({stats.needsFollowUp})
              </p>
              <p className="text-[11.5px] text-muted">
                مستندات بحالة «قيد الإجراء» بانتظار الرد أو التوجيه الإداري.
              </p>
            </div>
          </div>
          <span className="btn btn-secondary btn-sm shrink-0">
            عرض الآن
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          </span>
        </Link>
      )}

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={BarChart3}
            title="حركة المراسلات"
            description="آخر 14 يومًا"
            action={
              <div className="flex items-center gap-4 text-[11.5px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-sader" aria-hidden /> صادر
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-wared" aria-hidden /> وارد
                </span>
              </div>
            }
          />
          <div className="px-5 pb-4 pt-6">
            <div className="flex h-48 items-end gap-1.5 border-b border-line" role="img" aria-label="رسم بياني لحركة الصادر والوارد خلال آخر 14 يومًا">
              {series.map((s) => (
                <div
                  key={s.day}
                  className="group relative flex h-full flex-1 items-end justify-center gap-0.5"
                  title={`${s.day} — صادر: ${s.sader} · وارد: ${s.wared}`}
                >
                  <div
                    className="w-full max-w-[14px] rounded-t-[3px] bg-sader/80 transition-all group-hover:bg-sader"
                    style={{ height: `${(s.sader / seriesMax) * 100}%`, minHeight: s.sader ? 4 : 2 }}
                  />
                  <div
                    className="w-full max-w-[14px] rounded-t-[3px] bg-wared/80 transition-all group-hover:bg-wared"
                    style={{ height: `${(s.wared / seriesMax) * 100}%`, minHeight: s.wared ? 4 : 2 }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-1.5">
              {series.map((s, i) => (
                <div key={s.day} className="flex-1 text-center text-[10.5px] text-faint">
                  {i % 2 === 1 ? <LtrCode>{s.day.slice(8)}/{s.day.slice(5, 7)}</LtrCode> : null}
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader icon={PieChart} title="أنواع المستندات" description="التوزيع حسب التصنيف" />
          <div className="space-y-3.5 px-5 py-5">
            {typeBreakdown.length === 0 ? (
              <p className="py-8 text-center text-xs text-faint">لا توجد بيانات بعد.</p>
            ) : (
              typeBreakdown.map(([name, count]) => {
                const pct = Math.round((count / Math.max(1, docs.length)) * 100);
                return (
                  <div key={name}>
                    <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                      <span className="truncate text-fg">{name}</span>
                      <span className="num text-faint">
                        {count} · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                      <div className="h-full rounded-full bg-fg/70" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* Recent + Folders */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            icon={Clock3}
            title="أحدث المستندات"
            action={
              <Link href="/archive" className="btn btn-ghost btn-sm">
                عرض الكل
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              </Link>
            }
          />
          {loading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-10" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="لا توجد مستندات مؤرشفة بعد"
              description="ابدأ بتسجيل أول مستند وسيقوم الذكاء الاصطناعي بقراءته وتعبئة بياناته تلقائيًا."
              action={
                canCreate ? (
                  <Link href="/intake" className="btn btn-primary btn-sm">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden /> تسجيل مستند
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {docs.slice(0, 7).map((doc) => {
                const refNum = doc.direction === "sader" ? doc.saderNumber : doc.waredNumber;
                return (
                  <li key={doc.id}>
                    <Link
                      href={`/archive?docId=${doc.id}`}
                      className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-raised/50"
                    >
                      <DirectionBadge direction={doc.direction} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-fg">{doc.subject}</p>
                        <p className="mt-0.5 truncate text-[11.5px] text-faint">
                          {doc.entityName} · {doc.documentType}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-end sm:block">
                        <LtrCode className="text-[12px] font-medium text-fg">{refNum || "—"}</LtrCode>
                        <div>
                          <LtrCode className="text-[11px] text-faint">{docDate(doc) || "—"}</LtrCode>
                        </div>
                      </div>
                      {doc.syncedToLegacy ? (
                        <StatusPill tone="ok">متزامن</StatusPill>
                      ) : (
                        <StatusPill tone="warn">بالانتظار</StatusPill>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            icon={Folder}
            title="الملفات والحافظات"
            action={
              <Link href="/taxonomy" className="btn btn-ghost btn-sm">
                إدارة
              </Link>
            }
          />
          {folders.length === 0 ? (
            <EmptyState
              icon={Folder}
              title="لا توجد ملفات بعد"
              description="تُنشأ الحافظات تلقائيًا عند أرشفة المستندات."
            />
          ) : (
            <ul className="p-2">
              {folders
                .slice()
                .sort((a, b) => b.documentCount - a.documentCount)
                .slice(0, 8)
                .map((folder) => (
                  <li key={folder.id}>
                    <Link
                      href={`/archive?folder=${encodeURIComponent(folder.name)}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors hover:bg-raised"
                    >
                      <Folder className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                      <span className="flex-1 truncate text-fg">{folder.name}</span>
                      <span className="num text-[12px] text-faint">{folder.documentCount}</span>
                    </Link>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  footer,
  loading,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "neutral" | "sader" | "wared" | "ok";
  footer?: string;
  loading?: boolean;
}) {
  const toneCls = {
    neutral: "text-muted bg-raised",
    sader: "text-sader bg-sader/10",
    wared: "text-wared bg-wared/10",
    ok: "text-ok bg-ok/10",
  }[tone];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <p className="text-[12.5px] font-medium text-muted">{label}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", toneCls)}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      {loading ? (
        <div className="skeleton mt-3 h-8 w-20" />
      ) : (
        <p className="num mt-2 text-start font-display text-[30px] font-bold leading-none tracking-tight text-fg">
          {value.toLocaleString("en-US")}
        </p>
      )}
      {footer && <p className="mt-3 border-t border-line pt-3 text-[11.5px] text-faint">{footer}</p>}
    </Card>
  );
}
