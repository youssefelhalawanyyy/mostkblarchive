import crypto from "crypto";
import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { verifyRequestUser } from "@/lib/firebase/admin";
import {
  GEMINI_EXTRACTION_RESPONSE_SCHEMA,
  GeminiExtractionZodSchema,
} from "@/lib/gemini/schema";
import { buildArchivistSystemPrompt } from "@/lib/gemini/prompt";
import {
  buildSearchKeywords,
  normalizeDateString,
  toAsciiDigits,
} from "@/lib/archive/normalize";
import { DEFAULT_DOCUMENT_TYPES } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Free-tier friendly cap: stays under Vercel Hobby 4.5MB body limit & Gemini Free Tier TPM
const MAX_PDF_BYTES = 4.2 * 1024 * 1024;

// In-memory SHA-256 deduplication cache (prevents duplicate Gemini API calls on re-uploads)
const EXTRACTION_CACHE = new Map<string, Record<string, unknown>>();
const MAX_CACHE_ENTRIES = 40;

export async function POST(request: Request) {
  try {
    // 1. Authenticate & authorize
    let verifiedUser;
    try {
      verifiedUser = await verifyRequestUser(request);
    } catch (authErr) {
      const msg = authErr instanceof Error ? authErr.message : "Unauthorized";
      const status = msg.startsWith("FORBIDDEN") ? 403 : 401;
      return NextResponse.json(
        { error: "غير مصرح لك باستخدام خدمة التحليل الذكي.", details: msg },
        { status }
      );
    }

    if (verifiedUser.role !== "admin" && verifiedUser.role !== "editor") {
      return NextResponse.json(
        { error: "صلاحية مدخل بيانات أو مدير نظام مطلوبة لرفع وتحليل المستندات." },
        { status: 403 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "مفتاح Gemini API غير مُعدّ في متغيرات البيئة (GEMINI_API_KEY)." },
        { status: 500 }
      );
    }

    // 2. Parse multipart/form-data
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "يرجى إرفاق ملف PDF صالح للتحليل." },
        { status: 400 }
      );
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "نوع الملف غير مدعوم. يُسمح فقط بملفات PDF." },
        { status: 400 }
      );
    }

    if (file.size === 0 || file.size > MAX_PDF_BYTES) {
      return NextResponse.json(
        {
          error:
            "للبقاء ضمن الباقة المجانية، يرجى أن يكون حجم ملف الـ PDF أقل من 4 ميجابايت للتحليل التلقائي (يمكنك الحفظ اليدوي لأي حجم).",
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    const pdfHash = crypto
      .createHash("sha256")
      .update("v2-stamps:")
      .update(pdfBuffer)
      .digest("hex");

    // Return cached result immediately (0 Gemini API tokens used)
    const cached = EXTRACTION_CACHE.get(pdfHash);
    if (cached) {
      return NextResponse.json({ data: cached, cached: true });
    }

    const foldersRaw = String(formData.get("folders") || "[]");
    const typesRaw = String(formData.get("documentTypes") || "[]");
    const entitiesRaw = String(formData.get("entities") || "[]");

    let existingFolders: string[] = [];
    let documentTypes: string[] = DEFAULT_DOCUMENT_TYPES;
    let existingEntities: string[] = [];

    try {
      const parsedFolders = JSON.parse(foldersRaw);
      if (Array.isArray(parsedFolders)) existingFolders = parsedFolders.slice(0, 40).map(String);
    } catch {
      existingFolders = [];
    }

    try {
      const parsedTypes = JSON.parse(typesRaw);
      if (Array.isArray(parsedTypes) && parsedTypes.length > 0) {
        documentTypes = parsedTypes.slice(0, 20).map(String);
      }
    } catch {
      documentTypes = DEFAULT_DOCUMENT_TYPES;
    }

    try {
      const parsedEntities = JSON.parse(entitiesRaw);
      if (Array.isArray(parsedEntities)) existingEntities = parsedEntities.slice(0, 40).map(String);
    } catch {
      existingEntities = [];
    }

    // 3. Call Gemini 3.5 Flash-Lite (3–6s, Free Tier optimized) with automatic fallback
    const base64Pdf = pdfBuffer.toString("base64");
    const ai = new GoogleGenAI({ apiKey });
    const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const fallbackModels = Array.from(
      new Set([primaryModel, "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.7-flash"])
    );

    const systemInstruction = buildArchivistSystemPrompt({
      existingFolders,
      documentTypes,
      existingEntities,
    });

    let response = null;
    let lastError: unknown = null;

    for (const modelName of fallbackModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: "application/pdf",
                    data: base64Pdf,
                  },
                },
                {
                  text: "اقرأ الأختام بدقة (ميّز بين ٣ و ٢، ولا تخلط بين ختم الوارد وختم الصادر) واستخرج البيانات وملخص المستند وأهم 20 كلمة مفتاحية وفقاً للمخطط.",
                },
              ],
            },
          ],
          config: {
            systemInstruction,
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: GEMINI_EXTRACTION_RESPONSE_SCHEMA,
          },
        });
        if (response?.text) break;
      } catch (err) {
        lastError = err;
        const errMsg = err instanceof Error ? err.message : "";
        if (errMsg.includes("503") || errMsg.includes("404") || errMsg.includes("UNAVAILABLE")) {
          console.warn(`[/api/extract] Model ${modelName} unavailable, trying next fallback...`);
          continue;
        }
        throw err;
      }
    }

    if (!response?.text) {
      throw lastError || new Error("لم يُرجع نموذج الذكاء الاصطناعي بيانات قابلة للقراءة.");
    }

    const parsedJson = JSON.parse(response.text);
    const validated = GeminiExtractionZodSchema.parse(parsedJson);

    const normalizedWaredNumber = toAsciiDigits(validated.waredNumber).trim();
    const normalizedWaredDate = normalizeDateString(validated.waredDate);
    const normalizedSaderNumber = toAsciiDigits(validated.saderNumber).trim();
    const normalizedSaderDate = normalizeDateString(validated.saderDate);
    const normalizedExternalNumber = toAsciiDigits(validated.externalSaderNumber).trim();
    const normalizedExternalDate = normalizeDateString(validated.externalSaderDate);
    const normalizedDate = normalizeDateString(validated.documentDate);
    const compactFullText = (validated.fullText || "").slice(0, 15000);
    const normalizedKeywords = buildSearchKeywords({
      subject: validated.subject,
      summary: validated.summary,
      entityName: validated.entityName,
      documentType: validated.documentType,
      folderName: validated.suggestedFolder,
      waredNumber: normalizedWaredNumber,
      waredDate: normalizedWaredDate,
      saderNumber: normalizedSaderNumber,
      saderDate: normalizedSaderDate,
      externalSaderNumber: normalizedExternalNumber,
      externalSaderDate: normalizedExternalDate || normalizedDate,
      fullText: compactFullText,
      aiKeywords: validated.searchKeywords,
    });

    const payload = {
      ...validated,
      fullText: compactFullText,
      waredNumber: normalizedWaredNumber,
      waredDate: normalizedWaredDate,
      saderNumber: normalizedSaderNumber,
      saderDate: normalizedSaderDate,
      externalSaderNumber:
        normalizedExternalNumber && normalizedExternalNumber !== normalizedWaredNumber
          ? normalizedExternalNumber
          : "",
      externalSaderDate: normalizedExternalDate,
      documentDate: normalizedDate,
      searchKeywords: normalizedKeywords,
    };

    if (EXTRACTION_CACHE.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = EXTRACTION_CACHE.keys().next().value;
      if (oldestKey) EXTRACTION_CACHE.delete(oldestKey);
    }
    EXTRACTION_CACHE.set(pdfHash, payload);

    return NextResponse.json({ data: payload });
  } catch (error) {
    console.error("[/api/extract] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";

    if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate")) {
      return NextResponse.json(
        {
          error:
            "تم الوصول مؤقتاً للحد المجاني لطلبات Gemini API. انتظر دقيقة واحدة ثم أعد المحاولة أو أكمل الحقول يدوياً.",
        },
        { status: 429 }
      );
    }

    if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand")) {
      return NextResponse.json(
        {
          error:
            "خوادم Gemini تشهد ضغطاً مؤقتاً الآن. انتظر ثوانٍ وأعد المحاولة أو أكمل الحقول يدوياً.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "حدث خطأ أثناء تحليل المستند بالذكاء الاصطناعي.",
        details: msg,
      },
      { status: 500 }
    );
  }
}
