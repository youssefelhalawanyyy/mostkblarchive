"use client";

import { useEffect, useRef, useState } from "react";
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
  Highlighter,
  Eye,
  EyeOff,
} from "lucide-react";
import { LtrCode } from "@/components/ui/LtrCode";
import { cn } from "@/lib/utils";
import type { PdfHighlight } from "@/app/api/extract/route";

interface PdfViewerProps {
  objectUrl: string | null;
  filename?: string;
  pageCount?: number;
  analyzing?: boolean;
  highlights?: PdfHighlight[];
  activeHighlightIndex?: number | null;
  onSelectHighlight?: (index: number | null) => void;
  onCancelAnalyze?: () => void;
  onFilesSelected?: (files: File[]) => void;
}

const CATEGORY_STYLES: Record<
  PdfHighlight["category"],
  { fill: string; activeRing: string; badgeBg: string; labelAr: string }
> = {
  key_point: {
    fill: "bg-yellow-300/60 hover:bg-yellow-300/80 border-yellow-500/40",
    activeRing: "ring-2 ring-amber-500 bg-yellow-300/85 border-amber-600",
    badgeBg: "bg-amber-500 text-slate-950",
    labelAr: "نقطة رئيسية",
  },
  decision: {
    fill: "bg-amber-300/60 hover:bg-amber-300/80 border-amber-500/45",
    activeRing: "ring-2 ring-orange-500 bg-amber-300/85 border-orange-600",
    badgeBg: "bg-orange-500 text-white",
    labelAr: "قرار / إجراء",
  },
  amount: {
    fill: "bg-emerald-300/55 hover:bg-emerald-300/75 border-emerald-500/45",
    activeRing: "ring-2 ring-emerald-600 bg-emerald-300/80 border-emerald-700",
    badgeBg: "bg-emerald-600 text-white",
    labelAr: "مبلغ مالي",
  },
  date: {
    fill: "bg-sky-300/50 hover:bg-sky-300/70 border-sky-500/45",
    activeRing: "ring-2 ring-sky-600 bg-sky-300/75 border-sky-700",
    badgeBg: "bg-sky-600 text-white",
    labelAr: "تاريخ مهم",
  },
  stamp: {
    fill: "bg-fuchsia-300/45 hover:bg-fuchsia-300/65 border-fuchsia-500/45",
    activeRing: "ring-2 ring-fuchsia-600 bg-fuchsia-300/70 border-fuchsia-700",
    badgeBg: "bg-fuchsia-600 text-white",
    labelAr: "ختم رسمي",
  },
};

/**
 * Interactive PDF Canvas Viewer with AI Highlighter Overlays:
 * Renders each PDF page via pdfjs-dist onto a HiDPI <canvas> and draws
 * translucent highlighter bands directly on the document (works on scanned & digital PDFs).
 */
export function PdfViewer({
  objectUrl,
  filename,
  pageCount = 1,
  analyzing = false,
  highlights = [],
  activeHighlightIndex = null,
  onSelectHighlight,
  onCancelAnalyze,
  onFilesSelected,
}: PdfViewerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeBoxRef = useRef<HTMLButtonElement | null>(null);

  const [dragging, setDragging] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [loadedPages, setLoadedPages] = useState(0);
  const [showHighlights, setShowHighlights] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const [pdfFallback, setPdfFallback] = useState(false);
  const [containerWidth, setContainerWidth] = useState(560);

  // Store loaded pdfjs document proxy in ref
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfDocRef = useRef<any>(null);

  // Track scroll container width so PDF fits cleanly at 100% zoom
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth - 28;
      if (w > 220) setContainerWidth(w);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [objectUrl]);

  // Load PDF document via pdfjs-dist whenever objectUrl changes
  useEffect(() => {
    if (!objectUrl) {
      pdfDocRef.current = null;
      setLoadedPages(0);
      setCanvasSize(null);
      return;
    }

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let loadingTask: any = null;
    setPdfFallback(false);
    setPage(1);
    setLoadedPages(0);
    setRendering(true);

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        loadingTask = pdfjs.getDocument({ url: objectUrl });
        const doc = await loadingTask.promise;
        if (cancelled) {
          loadingTask.destroy?.();
          return;
        }
        pdfDocRef.current = doc;
        setLoadedPages(doc.numPages || 1);
      } catch (err) {
        console.error("[PdfViewer] pdfjs load error, falling back to iframe:", err);
        if (!cancelled) {
          setPdfFallback(true);
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
      pdfDocRef.current = null;
    };
  }, [objectUrl]);

  // Render current page onto HiDPI canvas whenever doc, page, zoom, or containerWidth changes
  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || pdfFallback || loadedPages === 0) return;

    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let renderTask: any = null;
    setRendering(true);

    (async () => {
      try {
        const safePage = Math.max(1, Math.min(loadedPages, page));
        const pdfPage = await doc.getPage(safePage);
        if (cancelled) return;

        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const fitScale = containerWidth / baseViewport.width;
        const cssScale = Math.max(0.4, fitScale * (zoom / 100));
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

        const cssViewport = pdfPage.getViewport({ scale: cssScale });
        const renderViewport = pdfPage.getViewport({ scale: cssScale * dpr });

        canvas.width = Math.floor(renderViewport.width);
        canvas.height = Math.floor(renderViewport.height);
        canvas.style.width = `${Math.floor(cssViewport.width)}px`;
        canvas.style.height = `${Math.floor(cssViewport.height)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        renderTask = pdfPage.render({
          canvasContext: ctx,
          viewport: renderViewport,
        });
        await renderTask.promise;

        if (!cancelled) {
          setCanvasSize({
            width: Math.floor(cssViewport.width),
            height: Math.floor(cssViewport.height),
          });
          setRendering(false);
        }
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name !== "RenderingCancelledException" && !cancelled) {
          console.error("[PdfViewer] render error:", err);
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
    };
  }, [loadedPages, page, zoom, containerWidth, pdfFallback]);

  // Jump to the active highlight's page and smoothly scroll it into view
  useEffect(() => {
    if (activeHighlightIndex === null || activeHighlightIndex === undefined) return;
    const target = highlights[activeHighlightIndex];
    if (!target) return;

    setShowHighlights(true);
    if (target.page !== page) {
      setPage(target.page);
    } else {
      activeBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeHighlightIndex, highlights]); // eslint-disable-line react-hooks/exhaustive-deps

  // After page switches and finishes rendering, scroll the active highlight into view
  useEffect(() => {
    if (!rendering && activeHighlightIndex !== null && activeBoxRef.current) {
      activeBoxRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [rendering, activeHighlightIndex]);

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
      accept="application/pdf,.pdf"
      className="hidden"
      onChange={(e) => {
        handleFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  // Empty Upload State
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
          اسحب ملف PDF هنا أو انقر لاختياره
        </p>
        <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1 text-[11.5px] text-muted">
          <Sparkles className="h-3 w-3 text-ai" aria-hidden />
          <span>يدعم PDF متعدد الصفحات والتظليل التلقائي للنقاط الرئيسية</span>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, loadedPages || pageCount);
  const pageHighlights = highlights
    .map((h, idx) => ({ ...h, origIdx: idx }))
    .filter((h) => h.page === page);

  return (
    <div className="card flex h-full min-h-[600px] flex-col overflow-hidden">
      {fileInput}

      {/* Top Viewer Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg/40 px-3.5 py-2">
        <span className="max-w-[140px] truncate text-[12px] font-medium text-fg">
          {filename || "معاينة PDF"}
        </span>

        <div className="flex flex-wrap items-center gap-1">
          {/* Page Controls */}
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

          <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />

          {/* Zoom Controls */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(60, z - 15))}
            className="btn btn-ghost btn-icon btn-sm"
            title="تصغير"
            aria-label="تصغير"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <LtrCode className="min-w-[36px] text-center text-[11.5px] text-muted">
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

          {/* Toggle Highlights */}
          {highlights.length > 0 && !pdfFallback && (
            <>
              <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
              <button
                type="button"
                onClick={() => setShowHighlights((s) => !s)}
                className={cn(
                  "btn btn-sm h-7 gap-1 px-2 text-[11.5px]",
                  showHighlights
                    ? "border border-amber-500/40 bg-amber-400/20 text-fg hover:bg-amber-400/30"
                    : "btn-ghost text-muted"
                )}
                title={showHighlights ? "إخفاء التظليل على الملف" : "إظهار التظليل على الملف"}
              >
                {showHighlights ? (
                  <Eye className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" aria-hidden />
                )}
                <span>تظليل</span>
                <LtrCode className="rounded bg-bg/60 px-1 text-[10.5px]">
                  {highlights.length}
                </LtrCode>
              </button>
            </>
          )}

          <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />

          {onFilesSelected && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="btn btn-ghost btn-sm h-7 px-2 text-[11.5px]"
              title="تغيير ملف PDF"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              تغيير
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

      {/* Analyzing Banner */}
      {analyzing && (
        <div className="flex items-center justify-between gap-2 border-b border-ai/25 bg-ai/10 px-3.5 py-2 text-[12px] text-fg">
          <span className="flex items-center gap-2 font-medium">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" aria-hidden />
            جاري قراءة المستند وتحديد النقاط الرئيسية لتظليلها…
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

      {/* Highlight Status Strip */}
      {!analyzing && highlights.length > 0 && showHighlights && !pdfFallback && (
        <div className="flex items-center justify-between gap-2 border-b border-line bg-panel/70 px-3.5 py-1.5 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <Highlighter className="h-3.5 w-3.5 text-amber-500" aria-hidden />
            <span>
              تم تظليل{" "}
              <strong className="text-fg">
                <LtrCode>{pageHighlights.length}</LtrCode>
              </strong>{" "}
              موضع في هذه الصفحة (من إجمالي <LtrCode>{highlights.length}</LtrCode>)
            </span>
          </span>
          <span className="hidden text-[10.5px] text-faint sm:inline">
            انقر على أي تظليل لعرض تفاصيله
          </span>
        </div>
      )}

      {/* PDF Canvas + Highlight Overlays */}
      {pdfFallback ? (
        <iframe
          src={`${objectUrl}#page=${page}&zoom=${zoom}&toolbar=1&navpanes=0`}
          title="معاينة ملف PDF"
          className="w-full flex-1 bg-bg"
        />
      ) : (
        <div
          ref={scrollContainerRef}
          className="relative flex-1 overflow-auto bg-bg/80 p-3.5 text-center"
        >
          <div
            className="relative mx-auto inline-block rounded-md bg-white shadow-lg ring-1 ring-black/15"
            style={
              canvasSize
                ? { width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }
                : undefined
            }
          >
            <canvas ref={canvasRef} className="block rounded-md" />

            {/* Translucent Highlighter Overlays */}
            {showHighlights &&
              canvasSize &&
              pageHighlights.map((h) => {
                const [ymin, xmin, ymax, xmax] = h.box_2d;
                const isActive = activeHighlightIndex === h.origIdx;
                const style = CATEGORY_STYLES[h.category] || CATEGORY_STYLES.key_point;

                return (
                  <button
                    key={`box-${h.origIdx}-${h.page}`}
                    ref={isActive ? activeBoxRef : undefined}
                    type="button"
                    onClick={() => onSelectHighlight?.(isActive ? null : h.origIdx)}
                    onMouseEnter={() => setHoveredIdx(h.origIdx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    aria-label={h.label || style.labelAr}
                    style={{
                      top: `${ymin / 10}%`,
                      left: `${xmin / 10}%`,
                      height: `${Math.max(1.8, (ymax - ymin) / 10)}%`,
                      width: `${Math.max(2.5, (xmax - xmin) / 10)}%`,
                    }}
                    className={cn(
                      "absolute cursor-pointer rounded-[3px] border transition-all duration-150 focus:outline-none",
                      "mix-blend-multiply",
                      isActive ? style.activeRing : style.fill,
                      isActive ? "z-20" : "z-10"
                    )}
                  />
                );
              })}

            {/* Crisp Non-Blended Floating Tooltips for Active / Hovered Highlight */}
            {showHighlights &&
              canvasSize &&
              pageHighlights.map((h) => {
                const isActive = activeHighlightIndex === h.origIdx;
                const isHovered = hoveredIdx === h.origIdx;
                if ((!isActive && !isHovered) || !h.label) return null;

                const [ymin, xmin, ymax] = h.box_2d;
                const style = CATEGORY_STYLES[h.category] || CATEGORY_STYLES.key_point;
                const showBelow = ymin < 110;

                return (
                  <div
                    key={`tip-${h.origIdx}-${h.page}`}
                    dir="rtl"
                    style={{
                      top: showBelow ? `${Math.min(96, ymax / 10 + 0.8)}%` : `${Math.max(1, ymin / 10 - 0.8)}%`,
                      left: `${Math.min(72, xmin / 10)}%`,
                      transform: showBelow ? "translateY(0)" : "translateY(-100%)",
                    }}
                    className={cn(
                      "pointer-events-none absolute z-30 flex max-w-[260px] items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold shadow-lg",
                      style.badgeBg
                    )}
                  >
                    <span className="truncate">{h.label}</span>
                  </div>
                );
              })}

            {rendering && (
              <div className="absolute inset-0 z-30 flex items-center justify-center rounded-md bg-bg/40 backdrop-blur-[1px]">
                <div className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[12px] text-fg shadow-md">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" aria-hidden />
                  جاري عرض الصفحة…
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
