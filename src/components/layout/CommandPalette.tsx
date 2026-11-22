"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Loader2, CornerDownLeft } from "lucide-react";
import { fetchArchiveDocuments } from "@/lib/archive/queries";
import type { ArchiveDocument } from "@/lib/types";
import { DirectionBadge } from "@/components/ui/DirectionBadge";
import { LtrCode } from "@/components/ui/LtrCode";
import { cn } from "@/lib/utils";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArchiveDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  // Sync React state with the native modal dialog
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const docs = await fetchArchiveDocuments({ search: query }, 8);
        if (!cancelled) {
          setResults(docs);
          setActive(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open]);

  const openDoc = (doc: ArchiveDocument) => {
    onClose();
    router.push(`/archive?docId=${doc.id}`);
  };

  return (
    <dialog
      ref={dialogRef}
      className="modal mt-[12vh] w-[640px]"
      aria-label="بحث فوري في الأرشيف"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-faint" aria-hidden />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                openDoc(results[active]);
              }
            }}
            placeholder="ابحث برقم القيد، رقم صادر الجهة، الموضوع، الجهة أو نص داخل الملف…"
            aria-label="نص البحث"
            className="h-12 flex-1 bg-transparent text-sm text-fg placeholder:text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-faint" aria-hidden />}
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 && !loading ? (
            <div className="py-12 text-center text-[13px] text-faint">لا توجد نتائج مطابقة.</div>
          ) : (
            <ul role="listbox" aria-label="نتائج البحث">
              {results.map((doc, idx) => {
                const refNum = doc.direction === "sader" ? doc.saderNumber : doc.waredNumber;
                const refDate = doc.direction === "sader" ? doc.saderDate : doc.waredDate;
                return (
                  <li key={doc.id} role="option" aria-selected={idx === active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => openDoc(doc)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start",
                        idx === active ? "bg-raised" : "hover:bg-raised/60"
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-fg">{doc.subject}</p>
                        <p className="mt-0.5 flex items-center gap-2 truncate text-[11.5px] text-faint">
                          <span className="truncate">{doc.entityName}</span>
                          {refNum && (
                            <>
                              <span aria-hidden>·</span>
                              <LtrCode>{refNum}</LtrCode>
                            </>
                          )}
                        </p>
                      </div>
                      <DirectionBadge direction={doc.direction} />
                      {refDate && <LtrCode className="hidden text-[11px] text-faint sm:inline-block">{refDate}</LtrCode>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-line bg-bg/40 px-4 py-2 text-[11px] text-faint">
          <span className="flex items-center gap-1.5">
            <CornerDownLeft className="h-3 w-3" aria-hidden /> للفتح
            <span className="mx-1">·</span>
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> للتنقل
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="kbd">Esc</kbd> للإغلاق
          </span>
        </div>
      </div>
    </dialog>
  );
}
