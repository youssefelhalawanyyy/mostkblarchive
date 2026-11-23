import crypto from "crypto";
import { NextResponse } from "next/server";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { z } from "zod";
import { normalizeDateString, toAsciiDigits } from "@/lib/archive/normalize";

export const runtime = "nodejs";
export const maxDuration = 30;

// Free-tier friendly cap (under Vercel Hobby 4.5MB serverless body limit)
const MAX_PDF_BYTES = 4.2 * 1024 * 1024;

const PdfAnalysisZodSchema = z.object({
  title: z.string().default(""),
  summary: z.string().default(""),
  keyPoints: z.array(z.string()).default([]),
  entityName: z.string().default(""),
  documentType: z.string().default(""),
  waredNumber: z.string().default(""),
  waredDate: z.string().default(""),
  saderNumber: z.string().default(""),
  saderDate: z.string().default(""),
  externalSaderNumber: z.string().default(""),
  documentDate: z.string().default(""),
  financialAmounts: z.array(z.string()).default([]),
  pageCount: z.number().int().min(1).default(1),
  fullText: z.string().default(""),
  keywords: z.array(z.string()).default([]),
});

export type PdfAnalysisResult = z.infer<typeof PdfAnalysisZodSchema>;

const PDF_ANALYSIS_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: "العنوان أو الموضوع الرسمي المختصر والواضح للمستند باللغة العربية.",
    },
    summary: {
      type: Type.STRING,
      description:
        "ملخص تنفيذي احترافي ومفصل من 3 إلى 5 جمل يوضح مضمون المستند، القرارات، المبالغ المالية، والمطلوب اتخاذه.",
    },
    keyPoints: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "أهم 3 إلى 8 نقاط رئيسية أو قرارات أو بنود مذكورة في المستند.",
    },
    entityName: {
      type: Type.STRING,
      description: "الجهة أو الوزارة أو الشركة المذكورة في الترويسة أو نص المستند.",
    },
    documentType: {
      type: Type.STRING,
      description: "نوع المستند (خطاب رسمي، عقد، مستخلص مالي، فاتورة، تقرير، مذكرة، إلخ).",
    },
    waredNumber: {
      type: Type.STRING,
      description:
        "الرقم المكتوب حصراً داخل ختم (الوارد / وارد) بالأرقام القياسية (0-9). ميّز بدقة بين ٣ (3) و ٢ (2). اتركه فارغاً إن لم يوجد.",
    },
    waredDate: {
      type: Type.STRING,
      description: "التاريخ داخل ختم الوارد بصيغة YYYY-MM-DD بالأرقام (0-9).",
    },
    saderNumber: {
      type: Type.STRING,
      description: "الرقم داخل ختم (الصادر / صادر) بالأرقام القياسية (0-9). اتركه فارغاً إن لم يوجد.",
    },
    saderDate: {
      type: Type.STRING,
      description: "التاريخ داخل ختم الصادر بصيغة YYYY-MM-DD بالأرقام (0-9).",
    },
    externalSaderNumber: {
      type: Type.STRING,
      description:
        "رقم صادر الجهة أو الرقم المرجعي على الترويسة أو الختم الثانوي (غير ختم الوارد) بالأرقام القياسية (0-9).",
    },
    documentDate: {
      type: Type.STRING,
      description: "تاريخ تحرير المستند المطبوع عليه بصيغة YYYY-MM-DD بالأرقام القياسية (0-9).",
    },
    financialAmounts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "جميع المبالغ المالية والعملات المذكورة في المستند (مثل: 34,700,000 جنيه مصري).",
    },
    pageCount: {
      type: Type.INTEGER,
      description: "عدد صفحات ملف الـ PDF.",
    },
    fullText: {
      type: Type.STRING,
      description:
        "النص الكامل الدقيق المستخرج (OCR) من جميع صفحات المستند باللغتين العربية والإنجليزية شاملاً الترويسة والجداول والأختام والتوقيعات.",
    },
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "أهم 10 إلى 20 كلمة مفتاحية رئيسية في المستند.",
    },
  },
  required: [
    "title",
    "summary",
    "keyPoints",
    "entityName",
    "documentType",
    "waredNumber",
    "waredDate",
    "saderNumber",
    "saderDate",
    "externalSaderNumber",
    "documentDate",
    "financialAmounts",
    "pageCount",
    "fullText",
    "keywords",
  ],
};

const SYSTEM_PROMPT = `
You are an expert Arabic & English Document Analyst and OCR Specialist.
Read EVERY page of the uploaded PDF — including scanned Arabic pages, rubber stamps (الأختام الزرقاء والحمراء), handwritten numbers, letterheads, tables, financial figures, and signatures — and return strictly structured JSON matching the schema.

### Rules:
1. **Complete OCR (\`fullText\`)**: Transcribe ALL readable text cleanly in reading order, preserving paragraphs, bullet points, numbers, and tables.
2. **Executive Summary (\`summary\` & \`keyPoints\`)**: Write a clear, formal Arabic summary and concise key bullet points capturing all decisions, dates, parties, and amounts.
3. **High-Precision Arabic-Indic Stamp Digits**:
   - Carefully distinguish **\`٣\` (3)** (two valleys / three peaks) from **\`٢\` (2)** (single hook), \`٠\` (0) from \`٥\` (5), \`٧\` (7) from \`٨\` (8), and \`٦\` (6) from \`٢\` (2).
   - Map stamps labeled **"الوارد"** ONLY to \`waredNumber\` / \`waredDate\`.
   - Map stamps labeled **"الصادر"** ONLY to \`saderNumber\` / \`saderDate\`.
   - Map letterhead / secondary reference stamps to \`externalSaderNumber\`.
   - Convert ALL extracted numbers & dates to Western ASCII digits (\`0123456789\`) and ISO dates (\`YYYY-MM-DD\`).
4. Never invent information not present in the PDF. Leave absent fields as \`""\` or \`[]\`.
`.trim();

// In-memory SHA-256 deduplication cache (0 tokens on repeat uploads)
const ANALYSIS_CACHE = new Map<string, PdfAnalysisResult>();
const MAX_CACHE_ENTRIES = 40;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "مفتاح GEMINI_API_KEY غير مُعدّ في متغيرات البيئة." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "يرجى إرفاق ملف PDF صالح." }, { status: 400 });
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
            "الحد الأقصى لحجم الملف في الباقة المجانية هو 4 ميجابايت. يرجى ضغط الملف ثم المحاولة مرة أخرى.",
        },
        { status: 400 }
      );
    }

    const pdfBuffer = Buffer.from(await file.arrayBuffer());
    const pdfHash = crypto
      .createHash("sha256")
      .update("pdf-tool-v1:")
      .update(pdfBuffer)
      .digest("hex");

    const cached = ANALYSIS_CACHE.get(pdfHash);
    if (cached) {
      return NextResponse.json({ data: cached, cached: true });
    }

    const base64Pdf = pdfBuffer.toString("base64");
    const ai = new GoogleGenAI({ apiKey });
    const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const models = Array.from(
      new Set([primaryModel, "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.7-flash"])
    );

    let response = null;
    let lastError: unknown = null;

    for (const modelName of models) {
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
                  text: "قم بقراءة هذا الملف بالكامل واستخراج العنوان والملخص التنفيذي والنقاط الرئيسية والأختام والتواريخ والمبالغ والنص الكامل (OCR) بدقة.",
                },
              ],
            },
          ],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: PDF_ANALYSIS_RESPONSE_SCHEMA,
          },
        });
        if (response?.text) break;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("503") || msg.includes("404") || msg.includes("UNAVAILABLE")) {
          continue;
        }
        throw err;
      }
    }

    if (!response?.text) {
      throw lastError || new Error("لم يُرجع الذكاء الاصطناعي بيانات قابلة للقراءة.");
    }

    const parsed = PdfAnalysisZodSchema.parse(JSON.parse(response.text));
    const normalizedWared = toAsciiDigits(parsed.waredNumber).trim();
    const normalizedExt = toAsciiDigits(parsed.externalSaderNumber).trim();

    const result: PdfAnalysisResult = {
      ...parsed,
      waredNumber: normalizedWared,
      waredDate: normalizeDateString(parsed.waredDate),
      saderNumber: toAsciiDigits(parsed.saderNumber).trim(),
      saderDate: normalizeDateString(parsed.saderDate),
      externalSaderNumber:
        normalizedExt && normalizedExt !== normalizedWared ? normalizedExt : "",
      documentDate: normalizeDateString(parsed.documentDate),
    };

    if (ANALYSIS_CACHE.size >= MAX_CACHE_ENTRIES) {
      const oldest = ANALYSIS_CACHE.keys().next().value;
      if (oldest) ANALYSIS_CACHE.delete(oldest);
    }
    ANALYSIS_CACHE.set(pdfHash, result);

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("[/api/extract] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";

    if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("rate")) {
      return NextResponse.json(
        { error: "تم الوصول مؤقتاً للحد المجاني لـ Gemini API. انتظر دقيقة ثم أعد المحاولة." },
        { status: 429 }
      );
    }
    if (msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("high demand")) {
      return NextResponse.json(
        { error: "خوادم Gemini تشهد ضغطاً مؤقتاً الآن. أعد المحاولة بعد ثوانٍ." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "حدث خطأ أثناء تحليل ملف الـ PDF.", details: msg },
      { status: 500 }
    );
  }
}
