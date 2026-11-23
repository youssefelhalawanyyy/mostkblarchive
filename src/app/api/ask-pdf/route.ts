import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 30;

const AskPdfSchema = z.object({
  question: z.string().min(2).max(1000),
  title: z.string().default(""),
  summary: z.string().default(""),
  fullText: z.string().default(""),
});

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "مفتاح GEMINI_API_KEY غير مُعدّ." }, { status: 500 });
    }

    const body = AskPdfSchema.parse(await request.json());
    const ai = new GoogleGenAI({ apiKey });
    const primaryModel = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const models = Array.from(new Set([primaryModel, "gemini-3.5-flash-lite", "gemini-3.5-flash"]));

    let answer = "";
    let lastError: unknown = null;

    for (const modelName of models) {
      try {
        const res = await ai.models.generateContent({
          model: modelName,
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `عنوان المستند: ${body.title}\n\nالملخص:\n${body.summary}\n\nالنص المستخرج:\n${body.fullText.slice(0, 20000)}\n\nالسؤال:\n${body.question}`,
                },
              ],
            },
          ],
          config: {
            systemInstruction:
              "أنت مساعد ذكي متخصص في الإجابة عن الأسئلة المتعلقة بملفات PDF بدقة واختصار ووضوح باللغة العربية اعتماداً فقط على محتوى المستند المرفق.",
            temperature: 0.2,
            maxOutputTokens: 1500,
          },
        });
        if (res.text) {
          answer = res.text;
          break;
        }
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("503") || msg.includes("404") || msg.includes("UNAVAILABLE")) {
          continue;
        }
        throw err;
      }
    }

    if (!answer) {
      throw lastError || new Error("تعذر الحصول على إجابة.");
    }

    return NextResponse.json({ answer });
  } catch (err) {
    console.error("[/api/ask-pdf] Error:", err);
    return NextResponse.json(
      { error: "تعذر الإجابة عن السؤال حالياً. يرجى المحاولة بعد لحظات." },
      { status: 500 }
    );
  }
}
