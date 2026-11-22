const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

const ARABIC_STOP_WORDS = new Set([
  "من",
  "في",
  "على",
  "الى",
  "إلى",
  "عن",
  "مع",
  "هذا",
  "هذه",
  "ذلك",
  "تلك",
  "التي",
  "الذي",
  "التى",
  "الذى",
  "او",
  "أو",
  "ثم",
  "كما",
  "بأن",
  "بان",
  "ان",
  "أن",
  "لا",
  "لم",
  "لن",
  "قد",
  "كان",
  "كانت",
  "تم",
  "بشأن",
  "بشان",
  "السيد",
  "السادة",
  "تحية",
  "طيبة",
  "وبعد",
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
]);

/**
 * Converts Arabic-Indic (٠-٩) and Persian/Eastern Arabic (۰-۹) digits to Western ASCII digits (0-9).
 */
export function toAsciiDigits(input: string): string {
  if (!input) return "";
  let out = "";
  for (const ch of input) {
    const idx1 = ARABIC_INDIC_DIGITS.indexOf(ch);
    if (idx1 !== -1) {
      out += String(idx1);
      continue;
    }
    const idx2 = EASTERN_ARABIC_DIGITS.indexOf(ch);
    if (idx2 !== -1) {
      out += String(idx2);
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Normalizes Arabic & English text for consistent indexing and search:
 * - Converts digits to ASCII 0-9
 * - Removes Arabic diacritics (tashkeel) and tatweel (ـ)
 * - Unifies Alef variants (أ إ آ -> ا), Teh Marbuta (ة -> ه), Alef Maksura (ى -> ي)
 * - Lowercases Latin text
 */
export function normalizeArabicText(input: string): string {
  if (!input) return "";
  return toAsciiDigits(input)
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
}

/**
 * Normalizes a date string into YYYY-MM-DD if recognizable, otherwise returns trimmed ASCII-digit string.
 */
export function normalizeDateString(input: string): string {
  const clean = toAsciiDigits(input || "").trim();
  if (!clean) return "";

  // Already YYYY-MM-DD
  const isoMatch = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return clean;
}

/**
 * Generates 40–60 normalized lowercase Arabic & English keywords for Firestore array-contains-any search.
 */
export function buildSearchKeywords(params: {
  subject?: string;
  summary?: string;
  entityName?: string;
  documentType?: string;
  folderName?: string;
  saderNumber?: string | null;
  saderDate?: string | null;
  waredNumber?: string | null;
  waredDate?: string | null;
  externalSaderNumber?: string | null;
  externalSaderDate?: string | null;
  legacyNotes?: string;
  fullText?: string;
  aiKeywords?: string[];
}): string[] {
  const keywords = new Set<string>();

  const addExact = (val?: string | null) => {
    if (!val) return;
    const norm = normalizeArabicText(val);
    if (norm.length >= 2) {
      keywords.add(norm);
    }
  };

  const tokenizeAndAdd = (text?: string | null, limit = 60) => {
    if (!text) return;
    const norm = normalizeArabicText(text);
    const tokens = norm.split(/[\s,،؛;:()[\]{}"'«»!?|]+/);
    let count = 0;
    for (const token of tokens) {
      if (count >= limit) break;
      const cleaned = token.replace(/^[-_./]+|[-_./]+$/g, "");
      if (cleaned.length < 2) continue;
      if (ARABIC_STOP_WORDS.has(cleaned)) continue;
      keywords.add(cleaned);
      // Also index stripped "ال" prefix for Arabic nouns so searching "عقد" matches "العقد"
      if (cleaned.startsWith("ال") && cleaned.length > 4) {
        keywords.add(cleaned.slice(2));
      }
      count++;
    }
  };

  // High-priority exact reference identifiers
  addExact(params.saderNumber);
  addExact(params.saderDate);
  addExact(params.waredNumber);
  addExact(params.waredDate);
  addExact(params.externalSaderNumber);
  addExact(params.externalSaderDate);

  // Also add numeric suffix parts of serial numbers (e.g. "2026/00142" -> "00142", "142", "2026")
  for (const ref of [params.saderNumber, params.waredNumber, params.externalSaderNumber]) {
    if (!ref) continue;
    const parts = toAsciiDigits(ref).split(/[/\-_\\.\s]+/);
    for (const p of parts) {
      if (p.length >= 2) {
        keywords.add(p.toLowerCase());
        const strippedZeros = p.replace(/^0+/, "");
        if (strippedZeros.length >= 1) keywords.add(strippedZeros.toLowerCase());
      }
    }
  }

  // Core metadata tokens
  tokenizeAndAdd(params.subject, 20);
  tokenizeAndAdd(params.entityName, 12);
  tokenizeAndAdd(params.documentType, 8);
  tokenizeAndAdd(params.folderName, 10);
  tokenizeAndAdd(params.summary, 20);
  tokenizeAndAdd(params.legacyNotes, 12);

  // AI-suggested keywords
  if (Array.isArray(params.aiKeywords)) {
    for (const kw of params.aiKeywords) {
      tokenizeAndAdd(kw, 3);
    }
  }

  // Fill remaining budget from fullText OCR
  if (keywords.size < 60 && params.fullText) {
    tokenizeAndAdd(params.fullText, 40);
  }

  return Array.from(keywords).slice(0, 60);
}

