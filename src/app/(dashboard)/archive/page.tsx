"use client";

import { Suspense, useEffect, useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  FileSpreadsheet,
  Printer,
  Loader2,
  ChevronDown,
  LayoutList,
  LayoutGrid,
  ArrowUpDown,
  BellRing,
  Download,
  DatabaseBackup,
} from "lucide-react";
import {
  fetchAllDocumentsForExport,
  fetchArchiveDocuments,
  fetchTaxonomy,
} from "@/lib/archive/queries";
import {
  exportDocumentsToExcelCsv,
  exportFullBackupJson,
  printOfficialRegister,
} from "@/lib/archive/export";
import type {
  ActionStatus,
  ArchiveDocument,
  ArchiveFilterState,
  DocumentTypeItem,
  EntityItem,
  FolderItem,
} from "@/lib/types";
import dynamic from "next/dynamic";
import { ArchiveFilters } from "@/components/archive/ArchiveFilters";
import { ArchiveTable } from "@/components/archive/ArchiveTable";
import { Card, PageHeader, Tabs } from "@/components/ui/primitives";
import { LtrCode } from "@/components/ui/LtrCode";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const DocumentDrawer = dynamic(
  () => import("@/components/archive/DocumentDrawer").then((m) => m.DocumentDrawer),
  { ssr: false }
);

const INITIAL_FILTERS: ArchiveFilterState = {
  search: "",
  direction: "all",
  entityName: "",
  documentType: "",
  folderName: "",
  dateFrom: "",
  dateTo: "",
  syncStatus: "all",
  actionStatus: "all",
};

type SortMode = "newest" | "oldest" | "ref";

function ArchiveContent() {
  const { profile } = useAuth();
  const searchParams = useSearchParams();
  const initialFolder = searchParams.get("folder") || "";
  const initialDocId = searchParams.get("docId");
  const initialActionStatus = (searchParams.get("actionStatus") || "all") as
    | "all"
    | ActionStatus;

  const [filters, setFilters] = useState<ArchiveFilterState>({
    ...INITIAL_FILTERS,
    folderName: initialFolder,
    actionStatus: initialActionStatus,
  });
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const [allDocs, setAllDocs] = useState<ArchiveDocument[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [entities, setEntities] = useState<EntityItem[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<ArchiveDocument | null>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    fetchTaxonomy()
      .then((tax) => {
        setFolders(tax.folders);
        setEntities(tax.entities);
        setDocumentTypes(tax.documentTypes);
      })
      .catch(console.error);
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const results = await fetchArchiveDocuments({}, 80);
      setAllDocs(results);
      if (initialDocId) {
        const match = results.find((d) => d.id === initialDocId);
        if (match) setSelectedDoc(match);
      }
    } catch (err) {
      console.error("Failed to fetch archive documents:", err);
    } finally {
      setLoading(false);
    }
  }, [initialDocId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const filteredWithoutDirection = useMemo(() => {
    const isAdmin = profile?.role === "admin";
    let list = isAdmin
      ? allDocs
      : allDocs.filter((r) => r.confidentiality !== "confidential");
    if (filters.entityName)
      list = list.filter((r) => r.entityName === filters.entityName);
    if (filters.documentType)
      list = list.filter((r) => r.documentType === filters.documentType);
    if (filters.folderName)
      list = list.filter((r) => r.folderName === filters.folderName);
    if (filters.syncStatus === "synced")
      list = list.filter((r) => r.syncedToLegacy);
    if (filters.syncStatus === "pending")
      list = list.filter((r) => !r.syncedToLegacy);
    if (filters.actionStatus && filters.actionStatus !== "all") {
      list = list.filter(
        (r) => (r.actionStatus || "archived") === filters.actionStatus
      );
    }
    if (filters.dateFrom) {
      list = list.filter((r) => {
        const d = r.direction === "sader" ? r.saderDate : r.waredDate;
        return d ? d >= filters.dateFrom : false;
      });
    }
    if (filters.dateTo) {
      list = list.filter((r) => {
        const d = r.direction === "sader" ? r.saderDate : r.waredDate;
        return d ? d <= filters.dateTo : false;
      });
    }
    if (filters.search.trim()) {
      const needle = filters.search.trim().toLowerCase();
      list = list.filter((r) =>
        [
          r.subject,
          r.summary,
          r.entityName,
          r.folderName,
          r.documentType,
          r.saderNumber || "",
          r.waredNumber || "",
          r.externalSaderNumber || "",
          r.legacyNotes || "",
          r.fullText || "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle)
      );
    }
    return list;
  }, [allDocs, filters, profile?.role]);

  const counts = useMemo(
    () => ({
      all: filteredWithoutDirection.length,
      sader: filteredWithoutDirection.filter((d) => d.direction === "sader").length,
      wared: filteredWithoutDirection.filter((d) => d.direction === "wared").length,
      followUp: filteredWithoutDirection.filter(
        (d) => d.actionStatus === "pending_action"
      ).length,
    }),
    [filteredWithoutDirection]
  );

  const documents = useMemo(() => {
    const base =
      filters.direction === "all"
        ? filteredWithoutDirection
        : filteredWithoutDirection.filter((d) => d.direction === filters.direction);

    const sorted = [...base];
    if (sortMode === "oldest") {
      sorted.sort((a, b) => {
        const da = (a.direction === "sader" ? a.saderDate : a.waredDate) || "";
        const db = (b.direction === "sader" ? b.saderDate : b.waredDate) || "";
        return da.localeCompare(db);
      });
    } else if (sortMode === "ref") {
      sorted.sort((a, b) => {
        const ra = (a.direction === "sader" ? a.saderNumber : a.waredNumber) || "";
        const rb = (b.direction === "sader" ? b.saderNumber : b.waredNumber) || "";
        return rb.localeCompare(ra, undefined, { numeric: true });
      });
    }
    return sorted;
  }, [filteredWithoutDirection, filters.direction, sortMode]);

  const canCreate = profile?.role === "admin" || profile?.role === "editor";

  const handleExportAllTime = async () => {
    setExportMenuOpen(false);
    setExportingAll(true);
    try {
      const allTimeDocs = await fetchAllDocumentsForExport();
      const visible =
        profile?.role === "admin"
          ? allTimeDocs
          : allTimeDocs.filter((d) => d.confidentiality !== "confidential");
      exportDocumentsToExcelCsv(visible, "all_time_archive");
    } finally {
      setExportingAll(false);
    }
  };

  const handleFullJsonBackup = async () => {
    setExportMenuOpen(false);
    setExportingAll(true);
    try {
      const [allTimeDocs, tax] = await Promise.all([
        fetchAllDocumentsForExport(),
        fetchTaxonomy(true),
      ]);
      const visible =
        profile?.role === "admin"
          ? allTimeDocs
          : allTimeDocs.filter((d) => d.confidentiality !== "confidential");
      exportFullBackupJson({
        documents: visible,
        folders: tax.folders,
        entities: tax.entities,
        documentTypes: tax.documentTypes,
      });
    } finally {
      setExportingAll(false);
    }
  };

  const handleDocumentUpdated = (updated: ArchiveDocument) => {
    setAllDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    setSelectedDoc(updated);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="أرشيف الصادر والوارد"
        description="بحث فوري، تصفية ذكية، وتصدير رسمي لجميع المراسلات والملفات المؤرشفة."
        actions={
          <>
            {/* Unified Executive Export & Print Menu */}
            <div ref={exportMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setExportMenuOpen((p) => !p)}
                className="btn btn-secondary"
              >
                {exportingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                <span>تصدير وطباعة</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </button>

              {exportMenuOpen && (
                <div className="absolute end-0 z-30 mt-1.5 w-56 rounded-xl border border-line bg-panel p-1.5 shadow-pop">
                  <button
                    type="button"
                    disabled={documents.length === 0}
                    onClick={() => {
                      setExportMenuOpen(false);
                      exportDocumentsToExcelCsv(documents, "filtered_archive");
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-[12.5px] font-medium text-fg hover:bg-raised disabled:opacity-40"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-ok" aria-hidden />
                    <span>تصدير النتائج الحالية (Excel)</span>
                  </button>
                  <button
                    type="button"
                    disabled={exportingAll}
                    onClick={handleExportAllTime}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-[12.5px] font-medium text-fg hover:bg-raised disabled:opacity-40"
                  >
                    <FileSpreadsheet className="h-4 w-4 text-muted" aria-hidden />
                    <span>نسخ احتياطي كامل (Excel)</span>
                  </button>
                  <button
                    type="button"
                    disabled={exportingAll}
                    onClick={handleFullJsonBackup}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-[12.5px] font-medium text-fg hover:bg-raised disabled:opacity-40"
                  >
                    <DatabaseBackup className="h-4 w-4 text-ai" aria-hidden />
                    <span>نسخ احتياطي كامل (JSON)</span>
                  </button>
                  <div className="my-1 border-t border-line" />
                  <button
                    type="button"
                    disabled={documents.length === 0}
                    onClick={() => {
                      setExportMenuOpen(false);
                      printOfficialRegister(documents);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-[12.5px] font-medium text-fg hover:bg-raised disabled:opacity-40"
                  >
                    <Printer className="h-4 w-4 text-sader" aria-hidden />
                    <span>طباعة كشف الصادر والوارد</span>
                  </button>
                </div>
              )}
            </div>

            {canCreate && (
              <Link href="/intake" className="btn btn-primary">
                <Sparkles className="h-4 w-4" aria-hidden />
                تسجيل مستند جديد
              </Link>
            )}
          </>
        }
      />

      {/* Executive Quick-Stat Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button
          type="button"
          onClick={() =>
            setFilters((f) => ({ ...f, direction: "all", actionStatus: "all" }))
          }
          className={cn(
            "card flex items-center justify-between px-4 py-3 text-start transition-colors hover:border-line-strong",
            filters.direction === "all" &&
              filters.actionStatus === "all" &&
              "border-fg/30"
          )}
        >
          <div>
            <p className="text-[11.5px] font-medium text-faint">إجمالي السجلات</p>
            <LtrCode className="mt-0.5 font-display text-xl font-bold text-fg">
              {counts.all}
            </LtrCode>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-raised text-muted">
            <Layers className="h-4 w-4" aria-hidden />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, direction: "sader" }))}
          className={cn(
            "card flex items-center justify-between px-4 py-3 text-start transition-colors hover:border-line-strong",
            filters.direction === "sader" && "border-sader/50"
          )}
        >
          <div>
            <p className="text-[11.5px] font-medium text-faint">صادر (مستلم)</p>
            <LtrCode className="mt-0.5 font-display text-xl font-bold text-fg">
              {counts.sader}
            </LtrCode>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sader/10 text-sader">
            <ArrowDownLeft className="h-4 w-4" aria-hidden />
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilters((f) => ({ ...f, direction: "wared" }))}
          className={cn(
            "card flex items-center justify-between px-4 py-3 text-start transition-colors hover:border-line-strong",
            filters.direction === "wared" && "border-wared/50"
          )}
        >
          <div>
            <p className="text-[11.5px] font-medium text-faint">وارد (مرسل)</p>
            <LtrCode className="mt-0.5 font-display text-xl font-bold text-fg">
              {counts.wared}
            </LtrCode>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-wared/10 text-wared">
            <ArrowUpRight className="h-4 w-4" aria-hidden />
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setFilters((f) => ({
              ...f,
              actionStatus:
                f.actionStatus === "pending_action" ? "all" : "pending_action",
            }))
          }
          className={cn(
            "card flex items-center justify-between px-4 py-3 text-start transition-colors hover:border-line-strong",
            filters.actionStatus === "pending_action" && "border-wared/50"
          )}
        >
          <div>
            <p className="text-[11.5px] font-medium text-faint">تحتاج متابعة</p>
            <LtrCode className="mt-0.5 font-display text-xl font-bold text-fg">
              {counts.followUp}
            </LtrCode>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-wared/10 text-wared">
            <BellRing className="h-4 w-4" aria-hidden />
          </span>
        </button>
      </div>

      {/* Main Unified Archive Surface */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 pt-3">
          <Tabs<ArchiveFilterState["direction"]>
            className="border-b-0"
            value={filters.direction}
            onChange={(direction) => setFilters((f) => ({ ...f, direction }))}
            items={[
              { id: "all", label: "الكل", count: counts.all, icon: Layers },
              { id: "sader", label: "صادر", count: counts.sader, icon: ArrowDownLeft },
              { id: "wared", label: "وارد", count: counts.wared, icon: ArrowUpRight },
            ]}
          />

          {/* Sort & View Controls */}
          <div className="flex items-center gap-2 pb-2.5">
            <div className="relative flex items-center">
              <ArrowUpDown
                className="pointer-events-none absolute start-2.5 h-3.5 w-3.5 text-faint"
                aria-hidden
              />
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                aria-label="ترتيب النتائج"
                className="input h-8 w-36 ps-8 text-[12px]"
              >
                <option value="newest">الأحدث أولاً</option>
                <option value="oldest">الأقدم أولاً</option>
                <option value="ref">رقم القيد</option>
              </select>
            </div>

            <div className="inline-flex rounded-lg border border-line bg-bg/60 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                  viewMode === "table"
                    ? "bg-panel text-fg shadow-card"
                    : "text-faint hover:text-fg"
                )}
                title="عرض جدول"
                aria-label="عرض جدول"
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                  viewMode === "cards"
                    ? "bg-panel text-fg shadow-card"
                    : "text-faint hover:text-fg"
                )}
                title="عرض بطاقات"
                aria-label="عرض بطاقات"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div className="border-b border-line px-5 py-3.5">
          <ArchiveFilters
            filters={filters}
            onChange={setFilters}
            onReset={() =>
              setFilters({ ...INITIAL_FILTERS, direction: filters.direction })
            }
            folders={folders}
            entities={entities}
            documentTypes={documentTypes}
          />
        </div>

        <ArchiveTable
          documents={documents}
          selectedId={selectedDoc?.id}
          onSelect={setSelectedDoc}
          loading={loading}
          viewMode={viewMode}
        />

        {!loading && documents.length > 0 && (
          <div className="flex items-center justify-between border-t border-line bg-bg/30 px-5 py-2.5 text-[12px] text-faint">
            <span>
              عرض <span className="num font-semibold text-fg">{documents.length}</span> مستند
            </span>
            <span>انقر على أي مستند للمعاينة أو استخدم أزرار الطباعة والتحميل السريع</span>
          </div>
        )}
      </Card>

      <DocumentDrawer
        doc={selectedDoc}
        onClose={() => setSelectedDoc(null)}
        onUpdated={handleDocumentUpdated}
        onSelectDoc={setSelectedDoc}
        allDocuments={allDocs}
        folders={folders.map((f) => f.name)}
        entities={entities.map((e) => e.name)}
        documentTypes={documentTypes.map((t) => t.name)}
      />
    </div>
  );
}

export default function ArchivePage() {
  return (
    <Suspense fallback={<div className="skeleton h-96" />}>
      <ArchiveContent />
    </Suspense>
  );
}
