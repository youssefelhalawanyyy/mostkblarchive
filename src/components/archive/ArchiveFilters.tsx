"use client";

import { useState } from "react";
import {
  Search,
  X,
  SlidersHorizontal,
  Calendar,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  ACTION_STATUS_LABELS,
  type ActionStatus,
  type ArchiveFilterState,
  type DocumentTypeItem,
  type EntityItem,
  type FolderItem,
} from "@/lib/types";
import { cn, getTodayIsoDate } from "@/lib/utils";

interface ArchiveFiltersProps {
  filters: ArchiveFilterState;
  onChange: (next: ArchiveFilterState) => void;
  onReset: () => void;
  folders: FolderItem[];
  entities: EntityItem[];
  documentTypes: DocumentTypeItem[];
  rightSlot?: React.ReactNode;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function ArchiveFilters({
  filters,
  onChange,
  onReset,
  folders,
  entities,
  documentTypes,
  rightSlot,
}: ArchiveFiltersProps) {
  const [expanded, setExpanded] = useState(false);

  const update = <K extends keyof ArchiveFilterState>(
    key: K,
    value: ArchiveFilterState[K]
  ) => onChange({ ...filters, [key]: value });

  const activeChips: Array<{ label: string; clear: () => void }> = [];
  if (filters.entityName) {
    activeChips.push({
      label: `الجهة: ${filters.entityName}`,
      clear: () => update("entityName", ""),
    });
  }
  if (filters.documentType) {
    activeChips.push({
      label: `النوع: ${filters.documentType}`,
      clear: () => update("documentType", ""),
    });
  }
  if (filters.folderName) {
    activeChips.push({
      label: `الملف: ${filters.folderName}`,
      clear: () => update("folderName", ""),
    });
  }
  if (filters.actionStatus && filters.actionStatus !== "all") {
    activeChips.push({
      label: `المتابعة: ${ACTION_STATUS_LABELS[filters.actionStatus]}`,
      clear: () => update("actionStatus", "all"),
    });
  }
  if (filters.syncStatus !== "all") {
    activeChips.push({
      label:
        filters.syncStatus === "synced"
          ? "السيرفر: متزامن"
          : "السيرفر: بانتظار المزامنة",
      clear: () => update("syncStatus", "all"),
    });
  }
  if (filters.dateFrom || filters.dateTo) {
    activeChips.push({
      label: `التاريخ: ${filters.dateFrom || "..."} ← ${filters.dateTo || "..."}`,
      clear: () => onChange({ ...filters, dateFrom: "", dateTo: "" }),
    });
  }

  const today = getTodayIsoDate();
  const applyDatePreset = (from: string, to: string) => {
    onChange({ ...filters, dateFrom: from, dateTo: to });
  };

  return (
    <div className="space-y-3">
      {/* Primary Single-Line Toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-faint"
            aria-hidden
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="بحث فوري برقم القيد، رقم صادر الجهة، الموضوع، الجهة، أو نص داخل الـ PDF…"
            aria-label="بحث في الأرشيف"
            className="input h-9 ps-9 text-[13px]"
          />
        </div>

        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          aria-expanded={expanded}
          className={cn(
            "btn btn-sm h-9 gap-2 px-3",
            expanded || activeChips.length > 0 ? "btn-primary" : "btn-secondary"
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          <span>تصفية متقدمة</span>
          {activeChips.length > 0 && (
            <span className="num rounded-full bg-panel/25 px-1.5 text-[11px] font-bold">
              {activeChips.length}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 opacity-75" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 opacity-75" aria-hidden />
          )}
        </button>

        {rightSlot}
      </div>

      {/* Collapsible Perfectly Aligned 4-Column Advanced Filter Panel */}
      {expanded && (
        <div className="rounded-xl border border-line bg-bg/50 p-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-faint">
                الجهة
              </label>
              <select
                value={filters.entityName}
                onChange={(e) => update("entityName", e.target.value)}
                className="input h-9 text-[12.5px]"
              >
                <option value="">كل الجهات</option>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.name}>
                    {ent.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-faint">
                نوع المستند
              </label>
              <select
                value={filters.documentType}
                onChange={(e) => update("documentType", e.target.value)}
                className="input h-9 text-[12.5px]"
              >
                <option value="">كل الأنواع</option>
                {documentTypes.map((dt) => (
                  <option key={dt.id} value={dt.name}>
                    {dt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-faint">
                الملف / الحافظة
              </label>
              <select
                value={filters.folderName}
                onChange={(e) => update("folderName", e.target.value)}
                className="input h-9 text-[12.5px]"
              >
                <option value="">كل الملفات</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-faint">
                حالة المتابعة
              </label>
              <select
                value={filters.actionStatus || "all"}
                onChange={(e) =>
                  update("actionStatus", e.target.value as "all" | ActionStatus)
                }
                className="input h-9 text-[12.5px]"
              >
                <option value="all">كل الحالات</option>
                <option value="pending_action">
                  {ACTION_STATUS_LABELS.pending_action}
                </option>
                <option value="replied">{ACTION_STATUS_LABELS.replied}</option>
                <option value="archived">{ACTION_STATUS_LABELS.archived}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-faint">
                من تاريخ
              </label>
              <input
                type="date"
                dir="ltr"
                value={filters.dateFrom}
                onChange={(e) => update("dateFrom", e.target.value)}
                className="input num h-9 text-[12.5px]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-faint">
                إلى تاريخ
              </label>
              <input
                type="date"
                dir="ltr"
                value={filters.dateTo}
                onChange={(e) => update("dateTo", e.target.value)}
                className="input num h-9 text-[12.5px]"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-faint">
                مزامنة السيرفر القديم
              </label>
              <select
                value={filters.syncStatus}
                onChange={(e) =>
                  update(
                    "syncStatus",
                    e.target.value as ArchiveFilterState["syncStatus"]
                  )
                }
                className="input h-9 text-[12.5px]"
              >
                <option value="all">الكل</option>
                <option value="synced">متزامن</option>
                <option value="pending">بانتظار المزامنة</option>
              </select>
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-faint">
                <Calendar className="h-3 w-3" aria-hidden />
                نطاق سريع
              </label>
              <div className="flex h-9 items-center gap-1">
                <button
                  type="button"
                  onClick={() => applyDatePreset(today, today)}
                  className="btn btn-secondary btn-sm flex-1 px-1.5 text-[11.5px]"
                >
                  اليوم
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset(isoDaysAgo(7), today)}
                  className="btn btn-secondary btn-sm flex-1 px-1.5 text-[11.5px]"
                >
                  7 أيام
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset(`${today.slice(0, 7)}-01`, today)}
                  className="btn btn-secondary btn-sm flex-1 px-1.5 text-[11.5px]"
                >
                  الشهر
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Removable Filter Chips */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[11.5px] font-medium text-fg"
            >
              <span>{chip.label}</span>
              <button
                type="button"
                onClick={chip.clear}
                className="text-faint hover:text-danger"
                aria-label={`إزالة ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="text-[11.5px] font-medium text-muted underline hover:text-fg ms-1"
          >
            مسح الكل
          </button>
        </div>
      )}
    </div>
  );
}
