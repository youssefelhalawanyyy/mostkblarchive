"use client";

import {
  FileSearch,
  Sparkles,
  Download,
  Printer,
  Eye,
  GitBranch,
  Folder,
  Building2,
  Calendar,
  Lock,
} from "lucide-react";
import { ACTION_STATUS_LABELS, type ArchiveDocument } from "@/lib/types";
import { DirectionBadge } from "@/components/ui/DirectionBadge";
import { LtrCode } from "@/components/ui/LtrCode";
import { EmptyState, StatusPill } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

interface ArchiveTableProps {
  documents: ArchiveDocument[];
  selectedId?: string | null;
  onSelect: (doc: ArchiveDocument) => void;
  loading?: boolean;
  viewMode?: "table" | "cards";
}

function quickPrintPdf(e: React.MouseEvent, pdfUrl: string) {
  e.stopPropagation();
  if (!pdfUrl) return;
  const win = window.open(pdfUrl, "_blank", "noopener,noreferrer");
  if (win) {
    win.addEventListener("load", () => {
      try {
        win.print();
      } catch {
        // fallback: browser PDF toolbar print
      }
    });
  }
}

export function ArchiveTable({
  documents,
  selectedId,
  onSelect,
  loading = false,
  viewMode = "table",
}: ArchiveTableProps) {
  if (loading) {
    return (
      <div className="space-y-2.5 p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-12" />
        ))}
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileSearch}
        title="لا توجد نتائج مطابقة"
        description="لم نعثر على مستندات تطابق معايير البحث الحالية. جرّب كلمات مختلفة أو امسح الفلاتر."
      />
    );
  }

  // Executive Cards Grid View
  if (viewMode === "cards") {
    return (
      <div className="grid grid-cols-1 gap-3.5 p-5 md:grid-cols-2 xl:grid-cols-3">
        {documents.map((doc) => {
          const isSader = doc.direction === "sader";
          const primaryNum = isSader ? doc.saderNumber : doc.waredNumber;
          const primaryDate = isSader ? doc.saderDate : doc.waredDate;
          const isSelected = selectedId === doc.id;

          return (
            <article
              key={doc.id}
              onClick={() => onSelect(doc)}
              className={cn(
                "group cursor-pointer rounded-xl border border-line bg-panel p-4 transition-all hover:border-line-strong hover:shadow-card",
                isSelected && "border-fg/40 bg-raised/40"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <DirectionBadge direction={doc.direction} />
                  <LtrCode className="text-[13px] font-bold text-fg">
                    {primaryNum || "—"}
                  </LtrCode>
                  {doc.threadId && (
                    <GitBranch
                      className="h-3.5 w-3.5 text-sader"
                      aria-label="مرتبط بسلسلة مراسلات"
                    />
                  )}
                </div>
                {doc.actionStatus === "pending_action" ? (
                  <StatusPill tone="warn">
                    {ACTION_STATUS_LABELS.pending_action}
                  </StatusPill>
                ) : doc.actionStatus === "replied" ? (
                  <StatusPill tone="ok">{ACTION_STATUS_LABELS.replied}</StatusPill>
                ) : (
                  <StatusPill tone="neutral">
                    {ACTION_STATUS_LABELS.archived}
                  </StatusPill>
                )}
              </div>

              <h3 className="mt-3 line-clamp-2 font-display text-[14px] font-bold leading-snug text-fg">
                {doc.subject}
              </h3>

              <div className="mt-3 space-y-1.5 text-[12px] text-muted">
                <p className="flex items-center gap-1.5 truncate">
                  <Building2 className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
                  <span className="truncate">{doc.entityName}</span>
                </p>
                <p className="flex items-center gap-1.5 truncate">
                  <Folder className="h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
                  <span className="truncate">
                    {doc.folderName} · {doc.documentType}
                  </span>
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-faint">
                  <Calendar className="h-3 w-3" aria-hidden />
                  <LtrCode>{primaryDate || "—"}</LtrCode>
                </span>

                <div className="flex items-center gap-1">
                  {doc.pdfUrl && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => quickPrintPdf(e, doc.pdfUrl)}
                        className="btn btn-ghost btn-icon btn-sm"
                        title="طباعة الـ PDF"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={doc.pdfUrl}
                        download={doc.originalFilename}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="btn btn-ghost btn-icon btn-sm"
                        title="تحميل الـ PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  // High-Density Executive Table View
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-[13px]">
        <caption className="sr-only">قائمة مستندات الصادر والوارد</caption>
        <thead className="sticky top-0 z-10 bg-bg/60 backdrop-blur-sm">
          <tr className="border-b border-line text-[11.5px] font-semibold text-faint">
            <th scope="col" className="px-5 py-3 text-start font-semibold">
              المرجع
            </th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">
              الموضوع والجهة
            </th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">
              الملف والنوع
            </th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">
              التاريخ
            </th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">
              المتابعة
            </th>
            <th scope="col" className="px-3 py-3 text-start font-semibold">
              السيرفر
            </th>
            <th scope="col" className="w-28 px-4 py-3 text-end font-semibold">
              إجراءات
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {documents.map((doc) => {
            const isSader = doc.direction === "sader";
            const primaryNum = isSader ? doc.saderNumber : doc.waredNumber;
            const primaryDate = isSader ? doc.saderDate : doc.waredDate;
            const isSelected = selectedId === doc.id;
            const ai = (doc.aiExtractedFields || []).length > 0;

            return (
              <tr
                key={doc.id}
                onClick={() => onSelect(doc)}
                className={cn(
                  "group cursor-pointer transition-colors hover:bg-raised/60",
                  isSelected && "bg-raised"
                )}
              >
                <td className="whitespace-nowrap px-5 py-3.5 align-middle">
                  <div className="flex items-center gap-2.5">
                    <DirectionBadge direction={doc.direction} />
                    <div className="leading-tight">
                      <div className="flex items-center gap-1.5">
                        <LtrCode className="font-mono text-[13px] font-bold text-fg">
                          {primaryNum || "—"}
                        </LtrCode>
                        {doc.threadId && (
                          <GitBranch
                            className="h-3 w-3 text-sader"
                            aria-label="مرتبط بسلسلة مراسلات"
                          />
                        )}
                      </div>
                      {!isSader && doc.externalSaderNumber && (
                        <div className="mt-0.5 text-[11px] text-faint">
                          الجهة: <LtrCode>{doc.externalSaderNumber}</LtrCode>
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                <td className="max-w-[380px] px-3 py-3.5 align-middle">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-semibold text-fg group-hover:underline">
                      {doc.subject}
                    </span>
                    {ai && (
                      <Sparkles
                        className="h-3 w-3 shrink-0 text-ai"
                        aria-label="مستخرج بالذكاء الاصطناعي"
                      />
                    )}
                    {doc.confidentiality === "confidential" && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-danger/10 px-1.5 py-px text-[10px] font-semibold text-danger">
                        <Lock className="h-2.5 w-2.5" aria-hidden />
                        سري
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11.5px] text-faint">
                    {doc.entityName}
                  </p>
                </td>

                <td className="max-w-[200px] px-3 py-3.5 align-middle">
                  <p className="truncate text-[12.5px] font-medium text-fg">
                    {doc.folderName}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-faint">
                    {doc.documentType}
                  </p>
                </td>

                <td className="whitespace-nowrap px-3 py-3.5 align-middle">
                  <LtrCode className="font-mono text-[12px] text-muted">
                    {primaryDate || "—"}
                  </LtrCode>
                </td>

                <td className="whitespace-nowrap px-3 py-3.5 align-middle">
                  {doc.actionStatus === "pending_action" ? (
                    <StatusPill tone="warn">
                      {ACTION_STATUS_LABELS.pending_action}
                    </StatusPill>
                  ) : doc.actionStatus === "replied" ? (
                    <StatusPill tone="ok">{ACTION_STATUS_LABELS.replied}</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">
                      {ACTION_STATUS_LABELS.archived}
                    </StatusPill>
                  )}
                </td>

                <td className="whitespace-nowrap px-3 py-3.5 align-middle">
                  {doc.syncedToLegacy ? (
                    <StatusPill tone="ok">متزامن</StatusPill>
                  ) : (
                    <StatusPill tone="warn">بالانتظار</StatusPill>
                  )}
                </td>

                <td className="whitespace-nowrap px-4 py-3.5 align-middle text-end">
                  <div className="inline-flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(doc);
                      }}
                      className="btn btn-ghost btn-icon btn-sm"
                      title="معاينة التفاصيل"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {doc.pdfUrl && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => quickPrintPdf(e, doc.pdfUrl)}
                          className="btn btn-ghost btn-icon btn-sm"
                          title="طباعة الـ PDF"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={doc.pdfUrl}
                          download={doc.originalFilename}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="btn btn-ghost btn-icon btn-sm"
                          title="تحميل الـ PDF"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </a>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
