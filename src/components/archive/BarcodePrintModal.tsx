"use client";

import { useEffect, useRef } from "react";
import { Printer, X } from "lucide-react";
import type { ArchiveDocument } from "@/lib/types";
import { LtrCode } from "@/components/ui/LtrCode";

interface BarcodePrintModalProps {
  doc: ArchiveDocument;
  onClose: () => void;
}

/** Deterministic SVG barcode bars generated from the reference string. */
function generateBarcodeBars(code: string): Array<{ x: number; w: number }> {
  const bars: Array<{ x: number; w: number }> = [];
  let cursor = 6;
  const seed = code || "ARCHIVE";
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    for (let bit = 0; bit < 4; bit++) {
      const width = ((ch >> bit) & 1) === 1 ? 3 : 1.5;
      bars.push({ x: cursor, w: width });
      cursor += width + (((ch >> (bit + 2)) & 1) === 1 ? 2.5 : 1.5);
    }
  }
  return bars;
}

export function BarcodePrintModal({ doc, onClose }: BarcodePrintModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
  }, []);

  const isSader = doc.direction === "sader";
  const refNumber = (isSader ? doc.saderNumber : doc.waredNumber) || doc.id.slice(0, 10);
  const refDate = (isSader ? doc.saderDate : doc.waredDate) || "—";
  const bars = generateBarcodeBars(`${doc.direction.toUpperCase()}-${refNumber}`);
  const svgWidth = bars.length > 0 ? bars[bars.length - 1].x + 12 : 200;

  return (
    <dialog
      ref={ref}
      className="modal w-[440px]"
      aria-labelledby="barcode-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="rounded-xl border border-line bg-panel shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 id="barcode-title" className="text-[14px] font-semibold">
            ملصق الأرشفة
          </h2>
          <button type="button" onClick={() => ref.current?.close()} className="btn btn-ghost btn-icon btn-sm" aria-label="إغلاق">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <div id="barcode-print-area" className="rounded-lg border border-zinc-300 bg-white p-4 text-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-2 text-xs font-bold">
              <span>{isSader ? "صادر — مستند مستلم" : "وارد — مستند مرسل"}</span>
              <LtrCode>{refDate}</LtrCode>
            </div>
            <div className="my-3 flex flex-col items-center">
              <svg viewBox={`0 0 ${svgWidth} 52`} className="h-14 w-full max-w-[280px]" aria-label={`Barcode ${refNumber}`}>
                {bars.map((b, idx) => (
                  <rect key={idx} x={b.x} y={2} width={b.w} height={48} fill="#0f172a" />
                ))}
              </svg>
              <LtrCode className="mt-1 text-sm font-bold tracking-widest">{refNumber}</LtrCode>
            </div>
            <div className="space-y-1 border-t border-zinc-200 pt-2 text-[11px]">
              <p className="truncate font-semibold">الموضوع: {doc.subject}</p>
              <p className="truncate text-zinc-600">الجهة: {doc.entityName}</p>
              <p className="truncate text-zinc-600">الملف: {doc.folderName}</p>
              {!isSader && doc.externalSaderNumber && (
                <p className="text-zinc-600">
                  صادر الجهة: <LtrCode>{doc.externalSaderNumber}</LtrCode>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={() => ref.current?.close()} className="btn btn-secondary">
            إلغاء
          </button>
          <button type="button" autoFocus onClick={() => window.print()} className="btn btn-primary">
            <Printer className="h-4 w-4" aria-hidden />
            طباعة
          </button>
        </div>
      </div>
    </dialog>
  );
}
