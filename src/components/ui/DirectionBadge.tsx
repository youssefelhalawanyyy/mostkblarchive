import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import type { CorrespondenceDirection } from "@/lib/types";
import { cn } from "@/lib/utils";

interface DirectionBadgeProps {
  direction: CorrespondenceDirection;
  size?: "sm" | "md";
  showSubtitle?: boolean;
}

export function DirectionBadge({
  direction,
  size = "sm",
  showSubtitle = false,
}: DirectionBadgeProps) {
  const isSader = direction === "sader";
  const Icon = isSader ? ArrowDownLeft : ArrowUpRight;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md font-semibold ring-1 ring-inset",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        isSader
          ? "bg-sader/10 text-sader ring-sader/25"
          : "bg-wared/10 text-wared ring-wared/25"
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      <span>{isSader ? "صادر" : "وارد"}</span>
      {showSubtitle && (
        <span className="font-normal opacity-75">{isSader ? "· مستلم" : "· مرسل"}</span>
      )}
    </span>
  );
}
