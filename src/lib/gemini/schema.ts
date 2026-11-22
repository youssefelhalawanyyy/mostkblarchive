import { z } from "zod";
import { Type, type Schema } from "@google/genai";

export const GeminiExtractionZodSchema = z.object({
  subject: z.string().default(""),
  summary: z.string().default(""),
  entityName: z.string().default(""),
  documentType: z.string().default("خطاب رسمي"),
  suggestedFolder: z.string().default(""),
  waredNumber: z.string().default(""),
  waredDate: z.string().default(""),
  saderNumber: z.string().default(""),
  saderDate: z.string().default(""),
  externalSaderNumber: z.string().default(""),
  externalSaderDate: z.string().default(""),
  documentDate: z.string().default(""),
  pageCount: z.number().int().min(1).default(1),
  fullText: z.string().default(""),
  searchKeywords: z.array(z.string()).default([]),
});

export type GeminiExtractionPayload = z.infer<typeof GeminiExtractionZodSchema>;

export const GEMINI_EXTRACTION_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    subject: {
      type: Type.STRING,
      description:
        "الموضوع الرسمي المختصر والواضح للمستند باللغة العربية الفصحى الإدارية.",
    },
    summary: {
      type: Type.STRING,
      description:
        "ملخص تنفيذي احترافي من 2 إلى 4 جمل يوضح مضمون المستند، القرارات، المبالغ المالية، والمطلوب اتخاذه.",
    },
    entityName: {
      type: Type.STRING,
      description:
        "الاسم الرسمي للجهة الخارجية المعنية بالمراسلة (الوزارة أو الهيئة أو الشركة الأخرى، وليس اسم شركتنا إذا كان خطاباً داخلياً موجهاً لجهة أو متعلقاً بجهة أخرى).",
    },
    documentType: {
      type: Type.STRING,
      description:
        "نوع المستند من القائمة المتاحة مثل: خطاب رسمي، عقد، مستخلص مالي، مناقصة / أمر توريد، فاتورة، محضر اجتماع، مذكرة داخلية، تقرير، أخرى.",
    },
    suggestedFolder: {
      type: Type.STRING,
      description:
        "أقرب اسم ملف / حافظة من القائمة المتاحة أو اسم ملف مقترح مناسب لموضوع المستند.",
    },
    waredNumber: {
      type: Type.STRING,
      description:
        "الرقم المكتوب أو المختوم حصراً داخل ختم (الوارد / وارد) بالأرقام القياسية (0-9). انتبه للتمييز الدقيق بين ٣ (3) و ٢ (2). اتركه فارغاً إن لم يوجد ختم وارد.",
    },
    waredDate: {
      type: Type.STRING,
      description:
        "التاريخ المكتوب أو المختوم حصراً داخل ختم (الوارد / وارد) بصيغة YYYY-MM-DD بالأرقام القياسية (0-9). اتركه فارغاً إن لم يوجد.",
    },
    saderNumber: {
      type: Type.STRING,
      description:
        "الرقم المكتوب أو المختوم حصراً داخل ختم (الصادر / صادر) أو رقم القيد الداخلي بالأرقام القياسية (0-9). اتركه فارغاً إن لم يوجد ختم صادر.",
    },
    saderDate: {
      type: Type.STRING,
      description:
        "التاريخ المكتوب أو المختوم حصراً داخل ختم (الصادر / صادر) بصيغة YYYY-MM-DD بالأرقام القياسية (0-9). اتركه فارغاً إن لم يوجد.",
    },
    externalSaderNumber: {
      type: Type.STRING,
      description:
        "رقم صادر الجهة الخارجية أو رقم الإشارة/الختم الثانوي (غير ختم الوارد) بالأرقام القياسية (0-9). لا تضع رقم ختم الوارد هنا أبداً! اتركه فارغاً إن لم يوجد.",
    },
    externalSaderDate: {
      type: Type.STRING,
      description:
        "تاريخ صادر الجهة الخارجية أو تاريخ تحرير الخطاب (غير تاريخ ختم الوارد) بصيغة YYYY-MM-DD بالأرقام القياسية (0-9). اتركه فارغاً إن لم يوجد.",
    },
    documentDate: {
      type: Type.STRING,
      description:
        "تاريخ تحرير المستند المطبوع في أسفل أو أعلى الخطاب (تحريراً في ...) بصيغة YYYY-MM-DD بالأرقام القياسية (0-9).",
    },
    pageCount: {
      type: Type.INTEGER,
      description: "عدد صفحات ملف الـ PDF.",
    },
    fullText: {
      type: Type.STRING,
      description:
        "النص الكامل المستخرج بدقة (OCR) من جميع صفحات المستند باللغتين العربية والإنجليزية شاملاً الجداول والأختام.",
    },
    searchKeywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "من 40 إلى 60 كلمة مفتاحية للبحث (أسماء جهات، أرقام مرجعية، تواريخ، مصطلحات إدارية ومالية، كلمات بالعربية والإنجليزية).",
    },
  },
  required: [
    "subject",
    "summary",
    "entityName",
    "documentType",
    "suggestedFolder",
    "waredNumber",
    "waredDate",
    "saderNumber",
    "saderDate",
    "externalSaderNumber",
    "externalSaderDate",
    "documentDate",
    "pageCount",
    "fullText",
    "searchKeywords",
  ],
};
