"use client";

import { useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  ExternalLink,
  UploadCloud,
  ChevronRight,
  ChevronLeft,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { LtrCode } from "@/components/ui/LtrCode";
import { cn } from "@/lib/utils";

interface PdfViewerProps {
  objectUrl: string | null;
  filename?: string;
  pageCount?: number;
  analyzing?: boolean;
  onCancelAnalyze?: () => void;
  onFilesSelected?: (files: File[]) => void;
}

/**
 * Unified Document Canvas (Left Panel — 45%):
 * - Empty state IS the drag-and-drop PDF uploader (eliminates duplicate boxes).
 * - Analyzing state displays a focused Gemini AI progress indicator.
 * - Loaded state renders the live interactive PDF viewer with replace/zoom/page controls.
 */
export function PdfViewer({
  objectUrl,
  filename,
  pageCount = 1,
  analyzing = false,
  onCancelAnalyze,
  onFilesSelected,
}: PdfViewerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);

  const handleFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !onFilesSelected) return;
    const pdfs = Array.from(fileList).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
    );
    if (pdfs.length === 0) return;
    setPage(1);
    onFilesSelected(pdfs);
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      multiple
      accept="application/pdf,.pdf"
      className="hidden"
      onChange={(e) => {
        handleFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  // 1. Empty Upload State (Unified Dropzone — No separate top box!)
  if (!objectUrl) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "card flex h-full min-h-[540px] cursor-pointer flex-col items-center justify-center border-dashed p-10 text-center transition-all",
          dragging
            ? "border-ai bg-ai/[0.06]"
            : "hover:border-line-strong hover:bg-raised/30"
        )}
      >
        {fileInput}
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line bg-raised text-fg">
          <UploadCloud className="h-5 w-5" aria-hidden />
        </div>
        <p className="mt-4 font-display text-[15px] font-bold text-fg">
          اسحب ملف PDF واحد أو عدة ملفات دفعة واحدة
        </p>
        <p className="mt-1.5 max-w-xs text-[12.5px] leading-relaxed text-muted">
          يدعم الرفع الجماعي (10–30 ملفاً) للمراجعة السريعة و «حفظ والتالي» بضغطة واحدة.
        </p>
        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1 text-[11.5px] text-muted">
          <Sparkles className="h-3 w-3 text-ai" aria-hidden />
          <span>يدعم PDF متعدد الصفحات (عربي / إنجليزي)</span>
        </div>
      </div>
    );
  }

  // 3. Live PDF Viewer State
  const totalPages = Math.max(1, pageCount);
  const viewerSrc = `${objectUrl}#page=${page}&zoom=${zoom}&toolbar=1&navpanes=0`;

  return (
    <div className="card flex h-full min-h-[600px] flex-col overflow-hidden">
      {fileInput}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg/40 px-3.5 py-2">
        <span className="max-w-[160px] truncate text-[12px] font-medium text-fg">
          {filename || "معاينة PDF"}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn btn-ghost btn-icon btn-sm"
            title="الصفحة السابقة"
            aria-label="الصفحة السابقة"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <LtrCode className="px-1 text-[11.5px] text-muted">
            {page}/{totalPages}
          </LtrCode>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="btn btn-ghost btn-icon btn-sm"
            title="الصفحة التالية"
            aria-label="الصفحة التالية"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          <span className="mx-1 h-4 w-px bg-line" aria-hidden />

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(50, z - 15))}
            className="btn btn-ghost btn-icon btn-sm"
            title="تصغير"
            aria-label="تصغير"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <LtrCode className="min-w-[38px] text-center text-[11.5px] text-muted">
            {zoom}%
          </LtrCode>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(200, z + 15))}
            className="btn btn-ghost btn-icon btn-sm"
            title="تكبير"
            aria-label="تكبير"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <span className="mx-1 h-4 w-px bg-line" aria-hidden />

          {onFilesSelected && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn btn-ghost btn-sm"
              title="استبدال أو إضافة ملفات PDF"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              إضافة / تغيير
            </button>
          )}

          <a
            href={objectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-icon btn-sm"
            title="فتح في تبويب مستقل"
            aria-label="فتح في تبويب مستقل"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {analyzing && (
        <div className="flex items-center justify-between gap-2 border-b border-ai/25 bg-ai/10 px-3.5 py-2 text-[12px] text-fg">
          <span className="flex items-center gap-2 font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" aria-hidden />
            جاري قراءة المستند وتعبئة الحقول بالذكاء الاصطناعي…
          </span>
          {onCancelAnalyze && (
            <button
              type="button"
              onClick={onCancelAnalyze}
              className="text-[11.5px] font-medium text-muted underline hover:text-fg"
            >
              إلغاء
            </button>
          )}
        </div>
      )}

      <iframe
        key={viewerSrc}
        src={viewerSrc}
        title="معاينة ملف PDF"
        className="w-full flex-1 bg-bg"
      />
    </div>
  );
}
