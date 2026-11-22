import { cn } from "@/lib/utils";

interface LtrCodeProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Isolates numeric codes, reference numbers, and ISO dates in dir="ltr"
 * so digits and slashes never scramble inside an RTL layout.
 */
export function LtrCode({ children, className }: LtrCodeProps) {
  return (
    <bdi dir="ltr" className={cn("inline-block tabular-nums tracking-tight", className)}>
      {children}
    </bdi>
  );
}
