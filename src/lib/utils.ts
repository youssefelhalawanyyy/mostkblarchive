import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Timestamp } from "firebase/firestore";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatTimestampArabic(ts: Timestamp | string | null | undefined): string {
  if (!ts) return "—";
  let date: Date;
  if (typeof ts === "string") {
    date = new Date(ts);
  } else if (typeof ts === "object" && "toDate" in ts && typeof ts.toDate === "function") {
    date = ts.toDate();
  } else {
    return "—";
  }
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_")
    .trim();
  return cleaned || "document.pdf";
}

export function slugifyTaxonomyId(name: string): string {
  // Stable deterministic doc ID for taxonomy items (Unicode-safe)
  const normalized = name.trim().toLowerCase().replace(/\s+/g, "_");
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
  }
  return `tx_${hash.toString(36)}`;
}

