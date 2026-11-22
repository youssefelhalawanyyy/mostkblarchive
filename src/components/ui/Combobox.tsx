"use client";

import { useState, useRef, useEffect, useId } from "react";
import { ChevronsUpDown, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  id?: string;
  className?: string;
  inputClassName?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "اختر أو اكتب...",
  required = false,
  id,
  className,
  inputClassName,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const needle = value.trim().toLowerCase();
  const filtered = options.filter((opt) => opt.toLowerCase().includes(needle)).slice(0, 40);
  const exactMatch = options.some((opt) => opt.trim().toLowerCase() === needle);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        autoComplete="off"
        value={value}
        required={required}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        className={cn("input pe-9", inputClassName)}
      />
      <ChevronsUpDown
        className="pointer-events-none absolute inset-y-0 end-3 my-auto h-3.5 w-3.5 text-faint"
        aria-hidden
      />

      {open && (filtered.length > 0 || (needle && !exactMatch)) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1.5 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-pop"
        >
          {filtered.map((opt) => (
            <li key={opt} role="option" aria-selected={opt === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-start text-[13px] text-fg hover:bg-raised"
              >
                <span className="truncate">{opt}</span>
                {opt === value && <Check className="h-3.5 w-3.5 shrink-0 text-fg" aria-hidden />}
              </button>
            </li>
          ))}

          {needle && !exactMatch && (
            <li>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-2.5 py-2 text-start text-xs font-medium text-muted hover:bg-raised hover:text-fg"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                <span>
                  إضافة جديد: <span className="text-fg">&ldquo;{value.trim()}&rdquo;</span>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
