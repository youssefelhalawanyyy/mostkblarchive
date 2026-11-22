"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Save,
  Loader2,
  Plus,
  Check,
  X,
  Sparkles,
  Settings2,
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import {
  ACTION_STATUS_LABELS,
  CONFIDENTIALITY_LABELS,
  type ActionStatus,
  type ArchiveDocument,
  type ConfidentialityLevel,
  type CorrespondenceDirection,
} from "@/lib/types";
import { AiSparkleBadge } from "@/components/ui/AiSparkleBadge";
import { toAsciiDigits } from "@/lib/archive/normalize";
import { cn } from "@/lib/utils";

export interface IntakeFormValues {
  direction: CorrespondenceDirection;
  saderNumber: string;
  saderDate: string;
  waredNumber: string;
  waredDate: string;
  externalSaderNumber: string;
  externalSaderDate: string;
  subject: string;
  summary: string;
  entityName: string;
  documentType: string;
  folderName: string;
  actionStatus: ActionStatus;
  confidentiality: ConfidentialityLevel;
  relatedDocId: string;
  legacyNotes: string;
  fullText: string;
  pageCount: number;
  searchKeywords: string[];
}

interface IntakeFormProps {
  values: IntakeFormValues;
  onChange: (next: IntakeFormValues) => void;
  aiFields: Set<string>;
  aiSuggestedEntity?: string;
  aiSuggestedFolder?: string;
  entityOptions: string[];
  folderOptions: string[];
  documentTypeOptions: string[];
  onQuickAddEntity: (name: string) => Promise<void>;
  onQuickAddDocumentType: (name: string) => Promise<void>;
  onQuickAddFolder: (name: string) => Promise<void>;
  linkableDocs?: ArchiveDocument[];
  duplicateDoc?: ArchiveDocument | null;
  canMarkConfidential?: boolean;
  queueRemaining?: number;
  saving: boolean;
  canSave: boolean;
  onSubmit: (e: React.FormEvent, mode?: "finish" | "next") => void;
}

export function IntakeForm({
  values,
  onChange,
  aiFields,
  aiSuggestedEntity,
  aiSuggestedFolder,
  entityOptions,
  folderOptions,
  documentTypeOptions,
  onQuickAddEntity,
  onQuickAddDocumentType,
  onQuickAddFolder,
  linkableDocs = [],
  duplicateDoc,
  canMarkConfidential = false,
  queueRemaining = 0,
  saving,
  canSave,
  onSubmit,
}: IntakeFormProps) {
  const isSader = values.direction === "sader";

  const [addingField, setAddingField] = useState<"entity" | "type" | "folder" | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [addingBusy, setAddingBusy] = useState(false);

  const setField = <K extends keyof IntakeFormValues>(
    key: K,
    val: IntakeFormValues[K]
  ) => {
    onChange({ ...values, [key]: val });
  };

  const handleConfirmQuickAdd = async (kind: "entity" | "type" | "folder", valueToAdd?: string) => {
    const trimmed = (valueToAdd ?? newItemName).trim();
    if (!trimmed) return;
    setAddingBusy(true);
    try {
      if (kind === "entity") {
        await onQuickAddEntity(trimmed);
        setField("entityName", trimmed);
      } else if (kind === "type") {
        await onQuickAddDocumentType(trimmed);
        setField("documentType", trimmed);
      } else {
        await onQuickAddFolder(trimmed);
        setField("folderName", trimmed);
      }
      setNewItemName("");
      setAddingField(null);
    } finally {
      setAddingBusy(false);
    }
  };

  const renderLabel = (
    title: string,
    fieldKey?: string,
    required = false,
    extraRight?: React.ReactNode
  ) => (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <label className="text-[12.5px] font-medium text-muted">
        {title}
        {required && <span className="ms-1 text-danger">*</span>}
      </label>
      <div className="flex items-center gap-1.5">
        {fieldKey && aiFields.has(fieldKey) && <AiSparkleBadge label="Gemini" />}
        {extraRight}
      </div>
    </div>
  );

  const renderManagedSelect = (opts: {
    kind: "entity" | "type" | "folder";
    label: string;
    fieldKey: "entityName" | "documentType" | "folderName";
    value: string;
    options: string[];
    placeholder: string;
    addPlaceholder: string;
    aiSuggestion?: string;
  }) => {
    const isAdding = addingField === opts.kind;
    const showAiSuggestion =
      opts.aiSuggestion &&
      !opts.options.some((o) => o.trim() === opts.aiSuggestion?.trim()) &&
      opts.value !== opts.aiSuggestion;

    return (
      <div>
        {renderLabel(
          opts.label,
          opts.fieldKey,
          true,
          <button
            type="button"
            onClick={() => {
              setAddingField(isAdding ? null : opts.kind);
              setNewItemName("");
            }}
            className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:bg-raised hover:text-fg"
          >
            <Plus className="h-3 w-3" aria-hidden />
            إضافة
          </button>
        )}

        {isAdding ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              autoFocus
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirmQuickAdd(opts.kind);
                } else if (e.key === "Escape") {
                  setAddingField(null);
                }
              }}
              placeholder={opts.addPlaceholder}
              className="input h-10 flex-1"
            />
            <button
              type="button"
              disabled={addingBusy || !newItemName.trim()}
              onClick={() => handleConfirmQuickAdd(opts.kind)}
              className="btn btn-primary btn-icon h-10 w-10 shrink-0"
              title="حفظ وإضافة للقائمة"
            >
              {addingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setAddingField(null)}
              className="btn btn-secondary btn-icon h-10 w-10 shrink-0"
              title="إلغاء"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <select
            required
            value={opts.value}
            onChange={(e) => setField(opts.fieldKey, e.target.value)}
            className={cn("input h-10", aiFields.has(opts.fieldKey) && "input-ai")}
          >
            <option value="" disabled>
              {opts.options.length > 0 ? opts.placeholder : "القائمة فارغة — اضغط (+ إضافة)"}
            </option>
            {opts.options.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        )}

        {showAiSuggestion && !isAdding && (
          <button
            type="button"
            disabled={addingBusy}
            onClick={() => handleConfirmQuickAdd(opts.kind, opts.aiSuggestion)}
            className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-ai/25 bg-ai/[0.07] px-2 py-1 text-[11px] font-medium text-ai hover:bg-ai/15"
          >
            <Sparkles className="h-3 w-3 shrink-0" aria-hidden />
            <span className="truncate">إضافة اقتراح Gemini: &ldquo;{opts.aiSuggestion}&rdquo;</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <form
      onSubmit={(e) => onSubmit(e, queueRemaining > 0 ? "next" : "finish")}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && canSave && !saving) {
          e.preventDefault();
          onSubmit(e as unknown as React.FormEvent, "next");
        }
      }}
      className="card flex flex-col overflow-hidden"
    >
      {duplicateDoc && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-wared/30 bg-wared/10 px-5 py-3 text-[12.5px]">
          <div className="flex items-center gap-2 font-medium text-wared">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              تنبيه تكرار: هذا الرقم المرجعي مسجل مسبقاً باسم «{duplicateDoc.subject}»
            </span>
          </div>
          <Link
            href={`/archive?docId=${duplicateDoc.id}`}
            target="_blank"
            className="inline-flex items-center gap-1 text-xs font-semibold text-fg underline"
          >
            عرض السجل السابق
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      )}
      <div className="space-y-6 p-6">
        {/* Reference Numbers */}
        <div className="space-y-4">
          {isSader ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                {renderLabel("رقم الصادر / القيد", "saderNumber", true)}
                <input
                  type="text"
                  dir="ltr"
                  required
                  value={values.saderNumber}
                  onChange={(e) => setField("saderNumber", toAsciiDigits(e.target.value))}
                  placeholder="2026/00001"
                  className={cn("input num h-10 font-mono", aiFields.has("saderNumber") && "input-ai")}
                />
              </div>
              <div>
                {renderLabel("تاريخ الصادر", "saderDate", true)}
                <input
                  type="date"
                  dir="ltr"
                  required
                  value={values.saderDate}
                  onChange={(e) => setField("saderDate", e.target.value)}
                  className={cn("input num h-10 font-mono", aiFields.has("saderDate") && "input-ai")}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                {renderLabel("رقم الوارد", "waredNumber", true)}
                <input
                  type="text"
                  dir="ltr"
                  required
                  value={values.waredNumber}
                  onChange={(e) => setField("waredNumber", toAsciiDigits(e.target.value))}
                  placeholder="2026/00001"
                  className={cn("input num h-10 font-mono", aiFields.has("waredNumber") && "input-ai")}
                />
              </div>
              <div>
                {renderLabel("تاريخ الوارد", "waredDate", true)}
                <input
                  type="date"
                  dir="ltr"
                  required
                  value={values.waredDate}
                  onChange={(e) => setField("waredDate", e.target.value)}
                  className={cn("input num h-10 font-mono", aiFields.has("waredDate") && "input-ai")}
                />
              </div>
              <div>
                {renderLabel("رقم صادر الجهة", "externalSaderNumber", true)}
                <input
                  type="text"
                  dir="ltr"
                  required
                  value={values.externalSaderNumber}
                  onChange={(e) =>
                    setField("externalSaderNumber", toAsciiDigits(e.target.value))
                  }
                  placeholder="رقم الخطاب على الترويسة"
                  className={cn(
                    "input num h-10 font-mono",
                    aiFields.has("externalSaderNumber") && "input-ai"
                  )}
                />
              </div>
              <div>
                {renderLabel("تاريخ صادر الجهة", "externalSaderDate", true)}
                <input
                  type="date"
                  dir="ltr"
                  required
                  value={values.externalSaderDate}
                  onChange={(e) => setField("externalSaderDate", e.target.value)}
                  className={cn(
                    "input num h-10 font-mono",
                    aiFields.has("externalSaderDate") && "input-ai"
                  )}
                />
              </div>
            </div>
          )}
        </div>

        <hr className="border-line" />

        {/* Managed Dropdown Lists (Entity, Document Type, Folder) */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {renderManagedSelect({
              kind: "entity",
              label: isSader ? "الجهة الراسلة" : "الجهة المرسل إليها",
              fieldKey: "entityName",
              value: values.entityName,
              options: entityOptions,
              placeholder: "اختر الجهة من القائمة…",
              addPlaceholder: "اسم الجهة الجديدة…",
              aiSuggestion: aiSuggestedEntity,
            })}

            {renderManagedSelect({
              kind: "type",
              label: "نوع المستند",
              fieldKey: "documentType",
              value: values.documentType,
              options: documentTypeOptions,
              placeholder: "اختر نوع المستند…",
              addPlaceholder: "نوع مستند جديد…",
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {renderManagedSelect({
              kind: "folder",
              label: "الملف / الحافظة",
              fieldKey: "folderName",
              value: values.folderName,
              options: folderOptions,
              placeholder: "اختر الملف / الحافظة…",
              addPlaceholder: "اسم الملف / الحافظة الجديدة…",
              aiSuggestion: aiSuggestedFolder,
            })}

            <div>
              {renderLabel("حالة المتابعة", undefined, false)}
              <select
                value={values.actionStatus}
                onChange={(e) => setField("actionStatus", e.target.value as ActionStatus)}
                className="input h-10"
              >
                <option value="archived">{ACTION_STATUS_LABELS.archived}</option>
                <option value="pending_action">{ACTION_STATUS_LABELS.pending_action}</option>
                <option value="replied">{ACTION_STATUS_LABELS.replied}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              {renderLabel("درجة السرية", undefined, false)}
              <select
                value={values.confidentiality}
                onChange={(e) =>
                  setField("confidentiality", e.target.value as ConfidentialityLevel)
                }
                className="input h-10"
              >
                <option value="normal">{CONFIDENTIALITY_LABELS.normal}</option>
                {canMarkConfidential && (
                  <option value="confidential">{CONFIDENTIALITY_LABELS.confidential}</option>
                )}
              </select>
            </div>

            {linkableDocs.length > 0 && (
              <div>
                {renderLabel("ربط بمستند سابق / رد على (اختياري)", undefined, false)}
                <select
                  value={values.relatedDocId}
                  onChange={(e) => setField("relatedDocId", e.target.value)}
                  className="input h-10"
                >
                  <option value="">— بدون ربط (مراسلة مستقلة) —</option>
                  {linkableDocs.slice(0, 60).map((d) => {
                    const num = d.direction === "sader" ? d.saderNumber : d.waredNumber;
                    const dirLabel = d.direction === "sader" ? "صادر" : "وارد";
                    return (
                      <option key={d.id} value={d.id}>
                        [{dirLabel} {num || "—"}] {d.subject.slice(0, 55)}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
          </div>

          {/* Unified Description (Subject + Executive Summary merged) */}
          <div>
            {renderLabel("الوصف والموضوع", "summary", true)}
            <textarea
              rows={4}
              required
              value={values.summary}
              onChange={(e) => setField("summary", e.target.value)}
              placeholder="موضوع المستند والملخص التنفيذي لمحتواه والقرارات والمبالغ المالية…"
              className={cn("input", aiFields.has("summary") && "input-ai")}
            />
          </div>

          <div>
            {renderLabel("ملاحظات إضافية")}
            <textarea
              rows={2}
              value={values.legacyNotes}
              onChange={(e) => setField("legacyNotes", e.target.value)}
              placeholder="ملاحظات اختيارية…"
              className="input"
            />
          </div>
        </div>
      </div>

      {/* Footer Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-bg/40 px-6 py-4">
        <Link
          href="/taxonomy"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted hover:text-fg"
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          إدارة قوائم الجهات والملفات والأنواع
          <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={(e) => onSubmit(e as unknown as React.FormEvent, "next")}
            className="btn btn-secondary btn-lg"
            title="اختصار: Ctrl + Enter"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <ArrowLeft className="h-4 w-4" aria-hidden />
            )}
            <span>
              {queueRemaining > 0
                ? `حفظ والتالي (${queueRemaining} متبقي)`
                : "حفظ وإضافة التالي"}
            </span>
          </button>

          <button
            type="button"
            disabled={!canSave || saving}
            onClick={(e) => onSubmit(e as unknown as React.FormEvent, "finish")}
            className="btn btn-primary btn-lg"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                جاري الحفظ…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden />
                حفظ وأرشفة
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
