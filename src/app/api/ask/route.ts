import { NextResponse } from "next/server";
import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { z } from "zod";
import { verifyRequestUser } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const maxDuration = 30;

const AskRequestSchema = z.object({
  question: z.string().min(2).max(1000),
  documents: z
    .array(
      z.object({
        id: z.string(),
        direction: z.enum(["sader", "wared"]),
        refNumber: z.string().optional().default(""),
        externalRef: z.string().optional().default(""),
        date: z.string().optional().default(""),
        subject: z.string().optional().default(""),
        summary: z.string().optional().default(""),
        entityName: z.string().optional().default(""),
        documentType: z.string().optional().default(""),
        folderName: z.string().optional().default(""),
        actionStatus: z.string().optional().default("archived"),
        legacyNotes: z.string().optional().default(""),
      })
    )
    .max(120),
});

const ASK_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    answer: {
      type: Type.STRING,
      description:
        "إجابة تنفيذية واضحة ومنظمة باللغة العربية الفصحى تجيب على سؤال المدير بناءً فقط على المستندات المرفقة، مع ذكر الأرقام والمبالغ والتواريخ بدقة.",
    },
    citedDocIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "معرفات المستندات (id) التي اعتمدت عليها الإجابة ليتم عرضها كروابط مباشرة للملفات.",
    },
  },
  required: ["answer", "citedDocIds"],
};

export async function POST(request: Request) {
  try {
    try {
      await verifyRequestUser(request);
    } catch (authErr) {
      const msg = authErr instanceof Error ? authErr.message : "Unauthorized";
      return NextResponse.json(
        { error: "يرجى تسجيل الدخول لاستخدام مساعد الأرشيف.", details: msg },
        { status: 401 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "مفتاح Gemini API غير مُعدّ." },
        { status: 500 }
      );
    }

    const body = await request.json();
    const parsed = AskRequestSchema.parse(body);

    const contextBlock = parsed.documents
      .map((d) =>
        [
          `ID: ${d.id}`,
          `الاتجاه: ${d.direction === "sader" ? "صادر (مستلم)" : "وارد (مرسل)"}`,
          `رقم القيد: ${d.refNumber || "—"}`,
          d.externalRef ? `صادر الجهة: ${d.externalRef}` : "",
          `التاريخ: ${d.date || "—"}`,
          `الجهة: ${d.entityName}`,
          `النوع: ${d.documentType}`,
          `الملف: ${d.folderName}`,
          `المتابعة: ${d.actionStatus}`,
          `الموضوع: ${d.subject}`,
          `الملخص: ${d.summary.slice(0, 350)}`,
          d.legacyNotes ? `ملاحظات: ${d.legacyNotes.slice(0, 150)}` : "",
        ]
          .filter(Boolean)
          .join(" | ")
      )
      .join("\n");

    const ai = new GoogleGenAI({ apiKey });
    const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const models = Array.from(
      new Set([primaryModel, "gemini-3.5-flash-lite", "gemini-3.5-flash"])
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
                  text: `سجل المستندات المتاحة في الأرشيف:\n${contextBlock || "لا توجد مستندات بعد."}\n\nسؤال المستخدم:\n${parsed.question}`,
                },
              ],
            },
          ],
          config: {
            systemInstruction:
              "أنت مساعد تنفيذي ذكي لأرشيف المراسلات الرسمية (الصادر والوارد). أجب بدقة واختصار واحترافية باللغة العربية اعتماداً فقط على المستندات المقدمة، واذكر الأرقام المرجعية والمبالغ المالية والتواريخ بوضوح، وأرجع في citedDocIds فقط معرفات المستندات (ID) المرتبطة بإجابتك. إذا لم توجد مستندات مطابقة، وضّح ذلك بأدب دون اختلاق معلومات.",
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
            responseSchema: ASK_RESPONSE_SCHEMA,
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
      throw lastError || new Error("لم يتم استلام إجابة من الذكاء الاصطناعي.");
    }

    const result = JSON.parse(response.text) as {
      answer: string;
      citedDocIds: string[];
    };

    return NextResponse.json({
      answer: result.answer || "",
      citedDocIds: Array.isArray(result.citedDocIds) ? result.citedDocIds : [],
    });
  } catch (err) {
    console.error("[/api/ask] Error:", err);
    return NextResponse.json(
      {
        error: "تعذر معالجة سؤالك حالياً. يرجى المحاولة بعد لحظات.",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

