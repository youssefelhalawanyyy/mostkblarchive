"use client";

import { useRef, useState } from "react";
import { UploadCloud, Sparkles, FileCheck2, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PdfDropzoneProps {
  selectedFile: File | null;
  analyzing: boolean;
  onFileSelected: (file: File) => void;
}

export function PdfDropzone({
  selectedFile,
  analyzing,
  onFileSelected,
}: PdfDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return;
    }
    onFileSelected(file);
  };

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
      onClick={() => !analyzing && inputRef.current?.click()}
      className={cn(
        "card relative cursor-pointer overflow-hidden border-dashed transition-all",
        dragging
          ? "border-ai bg-ai/[0.06]"
          : selectedFile
          ? "border-line-strong px-5 py-3.5 hover:border-fg/30"
          : "bg-grid px-6 py-7 hover:border-line-strong",
        analyzing && "pointer-events-none"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {analyzing ? (
        <div className="flex items-center gap-4 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ai/15 text-ai ring-1 ring-inset ring-ai/30">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-fg">
              جاري تحليل المستند واستخراج البيانات بواسطة Gemini AI…
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              قراءة الأختام والترويسات، استخراج الموضوع والملخص التنفيذي، وفهرسة النص الكامل (OCR)
            </p>
          </div>
        </div>
      ) : selectedFile ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ok/10 text-ok ring-1 ring-inset ring-ok/25">
              <FileCheck2 className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-fg">
                {selectedFile.name}
              </p>
              <p className="text-[11.5px] text-faint">
                <bdi dir="ltr" className="num">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                </bdi>{" "}
                · PDF جاهز للأرشفة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-ai/10 px-2.5 py-1 text-[11px] font-medium text-ai ring-1 ring-inset ring-ai/25">
              <Sparkles className="h-3 w-3" aria-hidden />
              مكتمل التحليل
            </span>
            <span className="btn btn-secondary btn-sm">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              استبدال الملف
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-panel text-fg shadow-card">
            <UploadCloud className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-3 text-[13.5px] font-semibold text-fg">
            اسحب ملف الـ PDF هنا أو انقر لاختياره من جهازك
          </p>
          <p className="mt-1 text-[12px] text-muted">
            يدعم الملفات الممسوحة ضوئيًا متعددة الصفحات بالعربية والإنجليزية (حتى 25 ميجابايت)
          </p>
        </div>
      )}
    </div>
  );
}
