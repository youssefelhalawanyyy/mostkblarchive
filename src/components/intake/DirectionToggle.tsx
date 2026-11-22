"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { CorrespondenceDirection } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DirectionToggleProps {
  value: CorrespondenceDirection;
  onChange: (direction: CorrespondenceDirection) => void;
}

/**
 * Compact, crisp segmented control for switching between
 * صادر (Incoming received by us) and وارد (Outgoing / dual-reference).
 */
export function DirectionToggle({ value, onChange }: DirectionToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="اتجاه المراسلة"
      className="inline-flex rounded-lg border border-line bg-panel p-1"
    >
      <button
        type="button"
        role="radio"
        aria-checked={value === "sader"}
        onClick={() => onChange("sader")}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-all",
          value === "sader"
            ? "bg-sader/15 text-sader ring-1 ring-inset ring-sader/30"
            : "text-muted hover:text-fg"
        )}
      >
        <ArrowDownLeft className="h-3.5 w-3.5" aria-hidden />
        <span>صادر (مستلم)</span>
      </button>

      <button
        type="button"
        role="radio"
        aria-checked={value === "wared"}
        onClick={() => onChange("wared")}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-semibold transition-all",
          value === "wared"
            ? "bg-wared/15 text-wared ring-1 ring-inset ring-wared/30"
            : "text-muted hover:text-fg"
        )}
      >
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        <span>وارد (مرسل)</span>
      </button>
    </div>
  );
}
