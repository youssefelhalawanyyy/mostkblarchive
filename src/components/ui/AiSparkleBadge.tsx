import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AiSparkleBadgeProps {
  label?: string;
  className?: string;
}

export function AiSparkleBadge({ label = "مستخرج آليًا", className }: AiSparkleBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-ai/10 px-1.5 py-px text-[10.5px] font-medium text-ai ring-1 ring-inset ring-ai/25",
        className
      )}
      title="تمت تعبئة هذا الحقل تلقائيًا بواسطة Gemini — يرجى المراجعة"
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      <span>{label}</span>
    </span>
  );
}
