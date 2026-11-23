"use client";

import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  UploadCloud,
  Sun,
  Moon,
  Copy,
  Check,
  Download,
  Printer,
  FileText,
  MessageSquare,
  Send,
  Loader2,
  AlertCircle,
  Plus,
  Building2,
  Calendar,
  Hash,
  Banknote,
  Tag,
  Clock,
  Highlighter,
} from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { PdfViewer } from "@/components/intake/PdfViewer";
import { LtrCode } from "@/components/ui/LtrCode";
import { Tabs } from "@/components/ui/primitives";
import type { PdfAnalysisResult, PdfHighlight } from "@/app/api/extract/route";

const HIGHLIGHT_DOT: Record<PdfHighlight["category"], string> = {
  key_point: "bg-yellow-400",
  decision: "bg-orange-400",
  amount: "bg-emerald-400",
  date: "bg-sky-400",
  stamp: "bg-fuchsia-400",
};

interface SessionItem {
  id: string;
  filename: string;
  objectUrl: string;
  result: PdfAnalysisResult;
  analyzedAt: string;
}

interface QaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

type OutputTab = "summary" | "text" | "qa";

function buildPlainTextReport(filename: string, data: PdfAnalysisResult): string {
  const lines: string[] = [];
  lines.push(`العنوان: ${data.title || filename}`);
  if (data.entityName) lines.push(`الجهة: ${data.entityName}`);
  if (data.documentType) lines.push(`النوع: ${data.documentType}`);
  if (data.waredNumber) lines.push(`رقم الوارد: ${data.waredNumber} (${data.waredDate || "—"})`);
  if (data.saderNumber) lines.push(`رقم الصادر: ${data.saderNumber} (${data.saderDate || "—"})`);
  if (data.externalSaderNumber) lines.push(`رقم صادر الجهة: ${data.externalSaderNumber}`);
  if (data.documentDate) lines.push(`تاريخ المستند: ${data.documentDate}`);
  if (data.financialAmounts.length > 0) {
    lines.push(`المبالغ المالية: ${data.financialAmounts.join(" ، ")}`);
  }
  lines.push("");
  lines.push("═══ الملخص التنفيذي ═══");
  lines.push(data.summary || "—");
  if (data.keyPoints.length > 0) {
    lines.push("");
    lines.push("═══ النقاط الرئيسية ═══");
    data.keyPoints.forEach((p, idx) => lines.push(`${idx + 1}. ${p}`));
  }
  lines.push("");
  lines.push("═══ النص الكامل (OCR) ═══");
  lines.push(data.fullText || "—");
  return lines.join("\n");
}

function downloadTxtFile(filename: string, content: string) {
  const blob = new Blob(["\uFEFF" + content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename.replace(/\.pdf$/i, "")}_extracted.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printSummaryReport(filename: string, data: PdfAnalysisResult) {
  const win = window.open("", "_blank", "width=900,height=800");
  if (!win) return;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pts = data.keyPoints.map((p) => `<li>${esc(p)}</li>`).join("");
  win.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${esc(data.title || filename)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: "IBM Plex Sans Arabic", "Cairo", Tahoma, Arial, sans-serif; color: #0f172a; line-height: 1.7; font-size: 13px; }
    h1 { font-size: 20px; margin: 0 0 6px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; }
    h2 { font-size: 14px; margin: 18px 0 6px; color: #334155; }
    .meta { display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #475569; margin-bottom: 14px; }
    .box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px; }
    pre { white-space: pre-wrap; font-family: inherit; font-size: 12px; background: #fafafa; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${esc(data.title || filename)}</h1>
  <div class="meta">
    ${data.entityName ? `<span><strong>الجهة:</strong> ${esc(data.entityName)}</span>` : ""}
    ${data.documentType ? `<span><strong>النوع:</strong> ${esc(data.documentType)}</span>` : ""}
    ${data.documentDate ? `<span><strong>التاريخ:</strong> ${esc(data.documentDate)}</span>` : ""}
    ${data.waredNumber ? `<span><strong>رقم الوارد:</strong> ${esc(data.waredNumber)}</span>` : ""}
    ${data.saderNumber ? `<span><strong>رقم الصادر:</strong> ${esc(data.saderNumber)}</span>` : ""}
  </div>
  <h2>الملخص التنفيذي</h2>
  <div class="box">${esc(data.summary || "—")}</div>
  ${pts ? `<h2>النقاط الرئيسية</h2><ul>${pts}</ul>` : ""}
  <h2>النص الكامل المستخرج</h2>
  <pre>${esc(data.fullText || "—")}</pre>
  <script>window.onload = function(){ window.print(); };</script>
</body>
</html>`);
  win.document.close();
}

export default function PdfAnalyzerHomePage() {
  const { theme, toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PdfAnalysisResult | null>(null);
  const [activeHighlightIndex, setActiveHighlightIndex] = useState<number | null>(null);
  const [tab, setTab] = useState<OutputTab>("summary");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [history, setHistory] = useState<SessionItem[]>([]);
  const [qaMessages, setQaMessages] = useState<QaMessage[]>([]);
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const copyText = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleCancelAnalyze = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAnalyzing(false);
  };

  const analyzeFile = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("يرجى اختيار ملف PDF صالح.");
      return;
    }

    abortRef.current?.abort();
    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPdfObjectUrl(objectUrl);
    setResult(null);
    setActiveHighlightIndex(null);
    setError("");
    setQaMessages([]);
    setTab("summary");
    setAnalyzing(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "تعذر تحليل ملف الـ PDF.");
      }

      const data = json.data as PdfAnalysisResult;
      setResult(data);

      const newItem: SessionItem = {
        id: `${Date.now()}`,
        filename: file.name,
        objectUrl,
        result: data,
        analyzedAt: new Date().toLocaleTimeString("ar-EG", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };
      setHistory((prev) => [newItem, ...prev].slice(0, 8));
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      setError(
        isAbort
          ? "تم إلغاء التحليل أو انتهت المهلة. يمكنك المحاولة مرة أخرى."
          : err instanceof Error
          ? err.message
          : "حدث خطأ غير متوقع أثناء قراءة الملف."
      );
    } finally {
      clearTimeout(timeoutId);
      if (abortRef.current === controller) abortRef.current = null;
      setAnalyzing(false);
    }
  };

  const handleAskPdf = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || !result || qaLoading) return;

    setQaMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, role: "user", content: trimmed },
    ]);
    setQaInput("");
    setQaLoading(true);

    try {
      const res = await fetch("/api/ask-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          title: result.title,
          summary: result.summary,
          fullText: result.fullText,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر الحصول على إجابة.");
      setQaMessages((prev) => [
        ...prev,
        { id: `a_${Date.now()}`, role: "assistant", content: json.answer },
      ]);
    } catch (err) {
      setQaMessages((prev) => [
        ...prev,
        {
          id: `e_${Date.now()}`,
          role: "assistant",
          content: err instanceof Error ? err.message : "حدث خطأ أثناء الإجابة.",
        },
      ]);
    } finally {
      setQaLoading(false);
    }
  };

  const resetToUpload = () => {
    abortRef.current?.abort();
    setSelectedFile(null);
    setPdfObjectUrl(null);
    setResult(null);
    setActiveHighlightIndex(null);
    setError("");
    setQaMessages([]);
  };

  const openFromHistory = (item: SessionItem) => {
    setSelectedFile(null);
    setPdfObjectUrl(item.objectUrl);
    setResult(item.result);
    setActiveHighlightIndex(null);
    setError("");
    setQaMessages([]);
    setTab("summary");
  };

  const currentFilename =
    selectedFile?.name ||
    history.find((h) => h.objectUrl === pdfObjectUrl)?.filename ||
    "document.pdf";

  const wordCount = result?.fullText
    ? result.fullText.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) analyzeFile(f);
          e.target.value = "";
        }}
      />

      {/* Minimalist Executive Header */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 lg:px-8">
          <button
            type="button"
            onClick={resetToUpload}
            className="flex items-center gap-2.5 text-start"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-inverse text-inverse-fg">
              <Sparkles className="h-4 w-4" aria-hidden />
            </span>
            <div className="leading-tight">
              <span className="block font-display text-[14.5px] font-bold text-fg">
                محلل PDF الذكي
              </span>
              <span className="hidden text-[11px] text-faint sm:block">
                استخراج فوري للملخص والنص الكامل وتظليل النقاط على الملف
              </span>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {pdfObjectUrl && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-primary btn-sm"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                ملف PDF جديد
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              className="btn btn-secondary btn-icon btn-sm"
              title={theme === "dark" ? "وضع النهار" : "الوضع الليلي"}
              aria-label={theme === "dark" ? "تفعيل وضع النهار" : "تفعيل الوضع الليلي"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-4 py-6 lg:px-8">
        {!pdfObjectUrl ? (
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center py-8">
            <div className="mb-6 text-center">
              <div className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai/10 px-3 py-1 text-[11.5px] font-medium text-ai">
                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                <span>قراءة وتظليل فوري بالذكاء الاصطناعي — مجاني بدون تسجيل</span>
              </div>
              <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                ارفع ملف PDF واحصل على الملخص والنص وتظليل النقاط المهمة
              </h1>
              <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                يدعم المستندات الممسوحة ضوئياً، الأختام العربية، الجداول، التواريخ،
                والمبالغ المالية مع تظليل بصري مباشر داخل صفحات الملف.
              </p>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) analyzeFile(f);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`card bg-grid flex w-full cursor-pointer flex-col items-center justify-center border-2 border-dashed px-6 py-16 text-center transition-all ${
                dragging
                  ? "border-ai bg-ai/[0.07]"
                  : "border-line-strong hover:border-fg/40"
              }`}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel text-fg shadow-card">
                <UploadCloud className="h-6 w-6" aria-hidden />
              </div>
              <p className="mt-4 font-display text-[16px] font-bold text-fg">
                اسحب ملف الـ PDF هنا أو انقر لاختياره
              </p>
              <p className="mt-1.5 text-[12.5px] text-muted">
                ملفات PDF باللغتين العربية والإنجليزية (حتى 4 ميجابايت)
              </p>
              <span className="btn btn-primary mt-6">اختيار ملف PDF</span>
            </div>

            {error && (
              <div className="mt-4 flex w-full items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[12.5px] font-medium text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                <span>{error}</span>
              </div>
            )}

            <div className="mt-8 grid w-full grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { icon: Highlighter, label: "تظليل على الـ PDF" },
                { icon: Sparkles, label: "ملخص تنفيذي" },
                { icon: FileText, label: "النص الكامل OCR" },
                { icon: MessageSquare, label: "اسأل عن الملف" },
              ].map((feat) => {
                const Icon = feat.icon;
                return (
                  <div
                    key={feat.label}
                    className="flex items-center justify-center gap-2 rounded-xl border border-line bg-panel px-3 py-2.5 text-[12px] font-medium text-muted"
                  >
                    <Icon className="h-3.5 w-3.5 text-ai" aria-hidden />
                    <span>{feat.label}</span>
                  </div>
                );
              })}
            </div>

            {history.length > 0 && (
              <div className="mt-8 w-full">
                <p className="eyebrow mb-2.5 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  الملفات التي تم تحليلها في هذه الجلسة
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {history.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openFromHistory(item)}
                      className="card flex items-center justify-between gap-3 px-4 py-3 text-start transition-colors hover:border-line-strong hover:bg-raised/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-fg">
                          {item.result.title || item.filename}
                        </p>
                        <p className="truncate text-[11px] text-faint">
                          {item.filename} · {item.analyzedAt}
                        </p>
                      </div>
                      <FileText className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
            {/* Right Panel: AI Summary, Extracted Data, Full OCR Text & Q&A */}
            <div className="card flex min-h-[600px] flex-col overflow-hidden">
              <div className="border-b border-line px-6 pt-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {analyzing ? (
                      <div className="space-y-2">
                        <div className="skeleton h-6 w-3/4" />
                        <div className="skeleton h-4 w-1/3" />
                      </div>
                    ) : (
                      <>
                        <h1 className="font-display text-[18px] font-bold leading-snug text-fg">
                          {result?.title || currentFilename}
                        </h1>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                          {result?.documentType && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-0.5 font-medium text-fg">
                              <Tag className="h-3 w-3 text-faint" aria-hidden />
                              {result.documentType}
                            </span>
                          )}
                          {result?.entityName && (
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 text-faint" aria-hidden />
                              {result.entityName}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {result && (
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          copyText("all", buildPlainTextReport(currentFilename, result))
                        }
                        className="btn btn-primary btn-sm"
                      >
                        {copiedKey === "all" ? (
                          <Check className="h-3.5 w-3.5" aria-hidden />
                        ) : (
                          <Copy className="h-3.5 w-3.5" aria-hidden />
                        )}
                        {copiedKey === "all" ? "تم النسخ" : "نسخ الكل"}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          downloadTxtFile(
                            currentFilename,
                            buildPlainTextReport(currentFilename, result)
                          )
                        }
                        className="btn btn-secondary btn-sm"
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        TXT
                      </button>

                      <button
                        type="button"
                        onClick={() => printSummaryReport(currentFilename, result)}
                        className="btn btn-secondary btn-sm"
                      >
                        <Printer className="h-3.5 w-3.5" aria-hidden />
                        طباعة
                      </button>
                    </div>
                  )}
                </div>

                <Tabs<OutputTab>
                  className="mt-4 border-b-0"
                  value={tab}
                  onChange={setTab}
                  items={[
                    { id: "summary", label: "الملخص والبيانات", icon: Sparkles },
                    { id: "text", label: "النص الكامل (OCR)", icon: FileText },
                    { id: "qa", label: "اسأل عن الملف", icon: MessageSquare },
                  ]}
                />
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {error && (
                  <div className="mb-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-[12.5px] font-medium text-danger">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                    <span>{error}</span>
                  </div>
                )}

                {analyzing ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ai/15 text-ai ring-1 ring-inset ring-ai/30">
                      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                    </div>
                    <p className="mt-4 font-display text-[15px] font-bold text-fg">
                      جاري قراءة المستند واستخراج الملخص والنص الكامل…
                    </p>
                    <p className="mt-1 text-[12.5px] text-muted">
                      يستغرق التحليل بضع ثوانٍ فقط.
                    </p>
                  </div>
                ) : !result ? (
                  <div className="py-16 text-center text-[13px] text-faint">
                    لا توجد بيانات مستخرجة لهذا الملف.
                  </div>
                ) : tab === "summary" ? (
                  <div className="space-y-6">
                    <section className="rounded-xl border border-line bg-bg/50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h2 className="eyebrow">الملخص التنفيذي</h2>
                        <button
                          type="button"
                          onClick={() => copyText("summary", result.summary)}
                          className="btn btn-ghost btn-sm h-7 px-2 text-[11.5px]"
                        >
                          {copiedKey === "summary" ? (
                            <Check className="h-3 w-3 text-ok" aria-hidden />
                          ) : (
                            <Copy className="h-3 w-3" aria-hidden />
                          )}
                          {copiedKey === "summary" ? "تم" : "نسخ"}
                        </button>
                      </div>
                      <p className="whitespace-pre-wrap text-[14px] leading-7 text-fg">
                        {result.summary || "لا يوجد ملخص."}
                      </p>
                    </section>

                    {result.highlights && result.highlights.length > 0 && (
                      <section>
                        <div className="mb-2.5 flex items-center justify-between gap-2">
                          <h2 className="eyebrow flex items-center gap-1.5">
                            <Highlighter className="h-3.5 w-3.5 text-amber-500" aria-hidden />
                            مواضع التظليل داخل الـ PDF
                          </h2>
                          <span className="text-[11px] text-faint">
                            انقر للانتقال إلى الموضع المظلل
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {result.highlights.map((h, idx) => {
                            const isActive = activeHighlightIndex === idx;
                            const dot = HIGHLIGHT_DOT[h.category] || HIGHLIGHT_DOT.key_point;
                            return (
                              <button
                                key={`${idx}-${h.page}`}
                                type="button"
                                onClick={() =>
                                  setActiveHighlightIndex(isActive ? null : idx)
                                }
                                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
                                  isActive
                                    ? "border-amber-500/70 bg-amber-400/20 text-fg shadow-sm"
                                    : "border-line bg-panel text-fg hover:border-line-strong hover:bg-raised"
                                }`}
                              >
                                <span
                                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`}
                                  aria-hidden
                                />
                                <span className="max-w-[230px] truncate">
                                  {h.label || `موضع ${idx + 1}`}
                                </span>
                                <span className="rounded bg-bg/70 px-1.5 py-0.5 text-[10.5px] text-muted">
                                  ص <LtrCode>{h.page}</LtrCode>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}

                    {result.keyPoints.length > 0 && (
                      <section>
                        <h2 className="eyebrow mb-2.5">أهم النقاط والقرارات</h2>
                        <ul className="space-y-2">
                          {result.keyPoints.map((pt, idx) => (
                            <li
                              key={idx}
                              className="flex items-start gap-2.5 rounded-lg border border-line bg-panel px-3.5 py-2.5 text-[13px] leading-relaxed text-fg"
                            >
                              <span className="num mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-raised text-[11px] font-bold text-muted">
                                {idx + 1}
                              </span>
                              <span>{pt}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}

                    {(result.waredNumber ||
                      result.saderNumber ||
                      result.externalSaderNumber ||
                      result.documentDate ||
                      result.financialAmounts.length > 0) && (
                      <section>
                        <h2 className="eyebrow mb-2.5">البيانات والأختام المستخرجة</h2>
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                          {result.waredNumber && (
                            <DataTile
                              icon={Hash}
                              label="رقم الوارد (الختم)"
                              value={<LtrCode>{result.waredNumber}</LtrCode>}
                              accent="wared"
                            />
                          )}
                          {result.waredDate && (
                            <DataTile
                              icon={Calendar}
                              label="تاريخ الوارد"
                              value={<LtrCode>{result.waredDate}</LtrCode>}
                            />
                          )}
                          {result.saderNumber && (
                            <DataTile
                              icon={Hash}
                              label="رقم الصادر (الختم)"
                              value={<LtrCode>{result.saderNumber}</LtrCode>}
                              accent="sader"
                            />
                          )}
                          {result.saderDate && (
                            <DataTile
                              icon={Calendar}
                              label="تاريخ الصادر"
                              value={<LtrCode>{result.saderDate}</LtrCode>}
                            />
                          )}
                          {result.externalSaderNumber && (
                            <DataTile
                              icon={Hash}
                              label="رقم صادر الجهة"
                              value={<LtrCode>{result.externalSaderNumber}</LtrCode>}
                            />
                          )}
                          {result.documentDate && (
                            <DataTile
                              icon={Calendar}
                              label="تاريخ المستند"
                              value={<LtrCode>{result.documentDate}</LtrCode>}
                            />
                          )}
                          {result.financialAmounts.map((amt, i) => (
                            <DataTile
                              key={i}
                              icon={Banknote}
                              label="مبلغ مالي مذكور"
                              value={amt}
                              accent="ok"
                            />
                          ))}
                        </div>
                      </section>
                    )}

                    {result.keywords.length > 0 && (
                      <section>
                        <h2 className="eyebrow mb-2">الكلمات المفتاحية</h2>
                        <div className="flex flex-wrap gap-1.5">
                          {result.keywords.map((kw) => (
                            <span
                              key={kw}
                              className="rounded-full border border-line bg-raised px-2.5 py-0.5 text-[11.5px] text-muted"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      </section>
                    )}
                  </div>
                ) : tab === "text" ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12px] text-muted">
                        <LtrCode className="font-semibold text-fg">{wordCount}</LtrCode> كلمة ·{" "}
                        <LtrCode className="font-semibold text-fg">{result.pageCount}</LtrCode>{" "}
                        صفحة
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => copyText("fullText", result.fullText)}
                          className="btn btn-primary btn-sm"
                        >
                          {copiedKey === "fullText" ? (
                            <Check className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <Copy className="h-3.5 w-3.5" aria-hidden />
                          )}
                          {copiedKey === "fullText" ? "تم نسخ النص" : "نسخ النص الكامل"}
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadTxtFile(currentFilename, result.fullText)}
                          className="btn btn-secondary btn-sm"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden />
                          تحميل النص
                        </button>
                      </div>
                    </div>

                    <pre className="min-h-[420px] whitespace-pre-wrap rounded-xl border border-line bg-bg/60 p-5 font-sans text-[13.5px] leading-8 text-fg select-text">
                      {result.fullText || "لم يتم العثور على نص قابل للقراءة في الملف."}
                    </pre>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[420px] flex-col">
                    <div className="flex-1 space-y-3 overflow-y-auto pb-4">
                      {qaMessages.length === 0 ? (
                        <div className="py-6 text-center">
                          <p className="text-[13px] font-medium text-fg">
                            اسأل أي سؤال حول هذا الملف
                          </p>
                          <div className="mt-4 flex flex-wrap justify-center gap-2">
                            {[
                              "ما المطلوب تنفيذه في هذا المستند؟",
                              "ما هي التواريخ والمبالغ المذكورة؟",
                              "اكتب لي رداً رسمياً مختصراً على هذا الخطاب",
                            ].map((q) => (
                              <button
                                key={q}
                                type="button"
                                onClick={() => handleAskPdf(q)}
                                className="rounded-lg border border-line bg-bg/50 px-3 py-2 text-[12px] text-fg hover:border-line-strong hover:bg-raised"
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        qaMessages.map((m) => (
                          <div
                            key={m.id}
                            className={`rounded-xl border px-4 py-3 text-[13px] leading-7 ${
                              m.role === "user"
                                ? "ms-8 border-line bg-raised text-fg"
                                : "me-8 border-ai/25 bg-ai/[0.06] text-fg"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{m.content}</p>
                          </div>
                        ))
                      )}
                      {qaLoading && (
                        <div className="flex items-center gap-2 text-[12px] text-muted">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-ai" />
                          جاري الإجابة…
                        </div>
                      )}
                    </div>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleAskPdf(qaInput);
                      }}
                      className="flex items-center gap-2 border-t border-line pt-3"
                    >
                      <input
                        type="text"
                        value={qaInput}
                        onChange={(e) => setQaInput(e.target.value)}
                        placeholder="اسأل عن أي تفصيلة داخل هذا الملف…"
                        className="input h-10 flex-1"
                      />
                      <button
                        type="submit"
                        disabled={!qaInput.trim() || qaLoading}
                        className="btn btn-primary h-10 px-4"
                      >
                        <Send className="h-4 w-4" aria-hidden />
                        إرسال
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </div>

            {/* Left Panel: Live Interactive PDF Preview */}
            <div className="xl:sticky xl:top-20 xl:h-[calc(100vh-6.5rem)]">
              <PdfViewer
                objectUrl={pdfObjectUrl}
                filename={currentFilename}
                pageCount={result?.pageCount || 1}
                analyzing={analyzing}
                highlights={result?.highlights || []}
                activeHighlightIndex={activeHighlightIndex}
                onSelectHighlight={setActiveHighlightIndex}
                onCancelAnalyze={handleCancelAnalyze}
                onFilesSelected={(files) => {
                  if (files[0]) analyzeFile(files[0]);
                }}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function DataTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Hash;
  label: string;
  value: React.ReactNode;
  accent?: "sader" | "wared" | "ok";
}) {
  return (
    <div
      className={`rounded-xl border border-line bg-bg/40 p-3 ${
        accent === "sader"
          ? "border-t-2 border-t-sader"
          : accent === "wared"
          ? "border-t-2 border-t-wared"
          : accent === "ok"
          ? "border-t-2 border-t-ok"
          : ""
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-faint">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-[13px] font-bold text-fg">{value}</div>
    </div>
  );
}
