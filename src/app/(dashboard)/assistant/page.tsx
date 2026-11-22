"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Send,
  Loader2,
  FileText,
  ExternalLink,
  Bot,
  User2,
} from "lucide-react";
import { fetchArchiveDocuments } from "@/lib/archive/queries";
import type { ArchiveDocument } from "@/lib/types";
import { useAuth } from "@/context/AuthContext";
import { Card, PageHeader } from "@/components/ui/primitives";
import { DirectionBadge } from "@/components/ui/DirectionBadge";
import { LtrCode } from "@/components/ui/LtrCode";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citedDocs?: ArchiveDocument[];
}

const STARTER_PROMPTS = [
  "ما هي المراسلات التي تحتاج متابعة أو رد حالياً؟",
  "لخّص أحدث الخطابات والمبالغ المالية المذكورة فيها",
  "ما هي المستندات المسجلة في ملف مشروعات قطاع الأحوال المدنية؟",
  "اعرض ملخصاً سريعاً لحركة الصادر والوارد المسجلة",
];

export default function ArchiveAssistantPage() {
  const { profile, getIdToken } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [docs, setDocs] = useState<ArchiveDocument[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchArchiveDocuments({}, 100)
      .then((all) => {
        // Respect confidentiality: non-admins never include confidential docs
        const visible = isAdmin
          ? all
          : all.filter((d) => d.confidentiality !== "confidential");
        setDocs(visible);
      })
      .catch(console.error);
  }, [isAdmin]);

  const askQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const token = await getIdToken();
      const compactDocs = docs.map((d) => ({
        id: d.id,
        direction: d.direction,
        refNumber: (d.direction === "sader" ? d.saderNumber : d.waredNumber) || "",
        externalRef: d.externalSaderNumber || "",
        date: (d.direction === "sader" ? d.saderDate : d.waredDate) || "",
        subject: d.subject || "",
        summary: d.summary || "",
        entityName: d.entityName || "",
        documentType: d.documentType || "",
        folderName: d.folderName || "",
        actionStatus: d.actionStatus || "archived",
        legacyNotes: d.legacyNotes || "",
      }));

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: trimmed, documents: compactDocs }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر الحصول على إجابة.");

      const citedIds = new Set<string>(json.citedDocIds || []);
      const citedDocs = docs.filter((d) => citedIds.has(d.id));

      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          content: json.answer || "لا توجد إجابة متاحة.",
          citedDocs,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e_${Date.now()}`,
          role: "assistant",
          content:
            err instanceof Error
              ? err.message
              : "حدث خطأ أثناء الاستعلام من مساعد الأرشيف.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        eyebrow="الذكاء الاصطناعي"
        title="اسأل الأرشيف"
        description={`اطرح أي سؤال بالعربية حول المراسلات، المشاريع، أو المبالغ المالية (يبحث ضمن ${docs.length} مستند متاح لك).`}
      />

      <Card className="flex min-h-[540px] flex-col overflow-hidden">
        {/* Conversation Area */}
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ai/15 text-ai ring-1 ring-inset ring-ai/30">
                <Sparkles className="h-6 w-6" aria-hidden />
              </div>
              <h2 className="mt-4 font-display text-base font-bold text-fg">
                كيف يمكنني مساعدتك في الأرشيف اليوم؟
              </h2>
              <p className="mt-1 max-w-md text-[12.5px] text-muted">
                اسألني عن أي خطاب، مبلغ مالي، جهة، أو مراسلات تحتاج متابعة وسأعرض لك
                الإجابة مع روابط مباشرة لملفات الـ PDF.
              </p>

              <div className="mt-6 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => askQuestion(prompt)}
                    className="rounded-xl border border-line bg-bg/50 px-4 py-3 text-start text-[12.5px] font-medium text-fg transition-colors hover:border-line-strong hover:bg-raised"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${
                  msg.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                    msg.role === "assistant"
                      ? "border-ai/30 bg-ai/15 text-ai"
                      : "border-line bg-raised text-fg"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="h-4 w-4" aria-hidden />
                  ) : (
                    <User2 className="h-4 w-4" aria-hidden />
                  )}
                </div>

                <div
                  className={`max-w-[85%] space-y-3 rounded-xl border px-4 py-3 text-[13.5px] leading-7 ${
                    msg.role === "user"
                      ? "border-line bg-raised text-fg"
                      : "border-line bg-bg/60 text-fg"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {msg.citedDocs && msg.citedDocs.length > 0 && (
                    <div className="space-y-1.5 border-t border-line pt-3">
                      <p className="text-[11px] font-semibold text-faint">
                        المستندات المرجعية ({msg.citedDocs.length}):
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {msg.citedDocs.map((d) => {
                          const num =
                            d.direction === "sader" ? d.saderNumber : d.waredNumber;
                          return (
                            <Link
                              key={d.id}
                              href={`/archive?docId=${d.id}`}
                              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel px-3 py-2 text-start transition-colors hover:border-line-strong hover:bg-raised"
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <FileText className="h-3.5 w-3.5 shrink-0 text-faint" />
                                <DirectionBadge direction={d.direction} />
                                <LtrCode className="text-[12px] font-semibold text-fg">
                                  {num || "—"}
                                </LtrCode>
                                <span className="truncate text-[12px] text-muted">
                                  {d.subject}
                                </span>
                              </div>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-faint" />
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {loading && (
            <div className="flex items-center gap-2.5 text-[12.5px] text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-ai" aria-hidden />
              <span>جاري البحث والتحليل في الأرشيف…</span>
            </div>
          )}
        </div>

        {/* Prompt Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            askQuestion(input);
          }}
          className="flex items-center gap-2 border-t border-line bg-bg/40 p-4"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب سؤالك هنا… (مثال: ما هي المبالغ المالية المذكورة في خطابات هذا الشهر؟)"
            className="input h-10 flex-1"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="btn btn-primary h-10 px-4"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            <span>إرسال</span>
          </button>
        </form>
      </Card>
    </div>
  );
}

