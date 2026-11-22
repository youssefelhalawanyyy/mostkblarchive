"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, RotateCcw, Files, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  DEFAULT_DOCUMENT_TYPES,
  type ArchiveDocument,
  type CorrespondenceDirection,
  type GeminiExtractionResult,
} from "@/lib/types";
import {
  fetchArchiveDocuments,
  fetchTaxonomy,
  findDuplicateDocument,
  linkDocumentsInThread,
  uploadPdfAndCreateDocument,
  upsertDocumentType,
  upsertEntity,
  upsertFolder,
} from "@/lib/archive/queries";
import { peekNextSerialNumber, reserveNextSerialNumber } from "@/lib/archive/counters";
import { buildSearchKeywords } from "@/lib/archive/normalize";
import { getTodayIsoDate } from "@/lib/utils";
import { DirectionToggle } from "@/components/intake/DirectionToggle";
import { IntakeForm, type IntakeFormValues } from "@/components/intake/IntakeForm";
import { PdfViewer } from "@/components/intake/PdfViewer";

const DRAFT_KEY = "mostkbl_intake_draft_v1";

function createDefaultValues(
  today: string,
  direction: CorrespondenceDirection = "sader"
): IntakeFormValues {
  return {
    direction,
    saderNumber: "",
    saderDate: today,
    waredNumber: "",
    waredDate: today,
    externalSaderNumber: "",
    externalSaderDate: "",
    subject: "",
    summary: "",
    entityName: "",
    documentType: DEFAULT_DOCUMENT_TYPES[0],
    folderName: "",
    actionStatus: "archived",
    confidentiality: "normal",
    relatedDocId: "",
    legacyNotes: "",
    fullText: "",
    pageCount: 1,
    searchKeywords: [],
  };
}

export default function IntakeStudioPage() {
  const router = useRouter();
  const { user, profile, getIdToken } = useAuth();

  // Bulk multi-PDF upload queue
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [duplicateDoc, setDuplicateDoc] = useState<ArchiveDocument | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [entityOptions, setEntityOptions] = useState<string[]>([]);
  const [folderOptions, setFolderOptions] = useState<string[]>([]);
  const [documentTypeOptions, setDocumentTypeOptions] = useState<string[]>(DEFAULT_DOCUMENT_TYPES);
  const [linkableDocs, setLinkableDocs] = useState<ArchiveDocument[]>([]);
  const [aiFields, setAiFields] = useState<Set<string>>(new Set());
  const [aiSuggestedEntity, setAiSuggestedEntity] = useState("");
  const [aiSuggestedFolder, setAiSuggestedFolder] = useState("");

  const today = getTodayIsoDate();
  const [values, setValues] = useState<IntakeFormValues>(() => {
    const defaults = createDefaultValues(today);
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(DRAFT_KEY);
        if (saved) return { ...defaults, ...JSON.parse(saved) };
      } catch {
        // ignore corrupted draft
      }
    }
    return defaults;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
    } catch {
      // ignore quota errors
    }
  }, [values]);

  useEffect(() => {
    fetchTaxonomy()
      .then((tax) => {
        setEntityOptions(tax.entities.map((e) => e.name));
        setFolderOptions(tax.folders.map((f) => f.name));
        if (tax.documentTypes.length > 0) {
          setDocumentTypeOptions(tax.documentTypes.map((t) => t.name));
        }
      })
      .catch(console.error);
    fetchArchiveDocuments({}, 60)
      .then(setLinkableDocs)
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    peekNextSerialNumber(values.direction)
      .then((serial) => {
        if (!active) return;
        setValues((prev) =>
          prev.direction === "sader"
            ? { ...prev, saderNumber: prev.saderNumber || serial }
            : { ...prev, waredNumber: prev.waredNumber || serial }
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [values.direction]);

  // Live Duplicate Reference Guard
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const dup = await findDuplicateDocument({
        direction: values.direction,
        saderNumber: values.saderNumber,
        waredNumber: values.waredNumber,
        externalSaderNumber: values.externalSaderNumber,
      });
      if (!cancelled) setDuplicateDoc(dup);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    values.direction,
    values.saderNumber,
    values.waredNumber,
    values.externalSaderNumber,
  ]);

  useEffect(() => {
    return () => {
      if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
    };
  }, [pdfObjectUrl]);

  const handleQuickAddEntity = async (name: string) => {
    await upsertEntity(name);
    setEntityOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
    setAiSuggestedEntity("");
  };

  const handleQuickAddDocumentType = async (name: string) => {
    await upsertDocumentType(name);
    setDocumentTypeOptions((prev) => (prev.includes(name) ? prev : [...prev, name]));
  };

  const handleQuickAddFolder = async (name: string) => {
    await upsertFolder(name);
    setFolderOptions((prev) => (prev.includes(name) ? prev : [...prev, name].sort()));
    setAiSuggestedFolder("");
  };

  const handleDirectionChange = (direction: CorrespondenceDirection) => {
    setValues((prev) => ({ ...prev, direction }));
  };

  const handleResetDraft = () => {
    window.localStorage.removeItem(DRAFT_KEY);
    setValues(createDefaultValues(getTodayIsoDate(), values.direction));
    setAiFields(new Set());
    setAiSuggestedEntity("");
    setAiSuggestedFolder("");
    setDuplicateDoc(null);
    setStatusMsg(null);
  };

  const handleCancelAnalyze = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setAnalyzing(false);
  };

  const loadAndAnalyzeFile = async (file: File) => {
    abortRef.current?.abort();
    if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
    setSelectedFile(file);
    setPdfObjectUrl(URL.createObjectURL(file));
    setStatusMsg(null);
    setAnalyzing(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const token = await getIdToken();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folders", JSON.stringify(folderOptions));
      formData.append("documentTypes", JSON.stringify(documentTypeOptions));
      formData.append("entities", JSON.stringify(entityOptions));

      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
        signal: controller.signal,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "تعذر تحليل المستند.");

      const extracted = json.data as GeminiExtractionResult;
      const filled = new Set<string>();

      setValues((prev) => {
        const next = { ...prev };
        if (extracted.subject || extracted.summary) {
          const subj = (extracted.subject || "").trim();
          const summ = (extracted.summary || "").trim();
          next.summary =
            subj && summ && !summ.startsWith(subj)
              ? `${subj}\n${summ}`
              : summ || subj;
          next.subject = subj || summ.split("\n")[0].slice(0, 140);
          filled.add("summary");
        }
        if (extracted.entityName) {
          const matchedEntity = entityOptions.find(
            (e) => e.trim().toLowerCase() === extracted.entityName.trim().toLowerCase()
          );
          if (matchedEntity) {
            next.entityName = matchedEntity;
            filled.add("entityName");
            setAiSuggestedEntity("");
          } else {
            setAiSuggestedEntity(extracted.entityName.trim());
          }
        }
        if (extracted.documentType) {
          const matchedType = documentTypeOptions.find(
            (t) => t.trim() === extracted.documentType.trim()
          );
          if (matchedType) {
            next.documentType = matchedType;
            filled.add("documentType");
          }
        }
        if (extracted.suggestedFolder) {
          const matchedFolder = folderOptions.find(
            (f) => f.trim().toLowerCase() === extracted.suggestedFolder.trim().toLowerCase()
          );
          if (matchedFolder) {
            next.folderName = matchedFolder;
            filled.add("folderName");
            setAiSuggestedFolder("");
          } else {
            setAiSuggestedFolder(extracted.suggestedFolder.trim());
          }
        }
        if (extracted.waredNumber) {
          next.waredNumber = extracted.waredNumber;
          filled.add("waredNumber");
        }
        if (extracted.waredDate) {
          next.waredDate = extracted.waredDate;
          filled.add("waredDate");
        }
        if (extracted.saderNumber) {
          next.saderNumber = extracted.saderNumber;
          filled.add("saderNumber");
        }
        if (extracted.saderDate) {
          next.saderDate = extracted.saderDate;
          filled.add("saderDate");
        } else if (extracted.documentDate && prev.direction === "sader") {
          next.saderDate = extracted.documentDate;
          filled.add("saderDate");
        }
        if (extracted.externalSaderNumber) {
          next.externalSaderNumber = extracted.externalSaderNumber;
          filled.add("externalSaderNumber");
        } else if (extracted.saderNumber && prev.direction === "wared") {
          next.externalSaderNumber = extracted.saderNumber;
          filled.add("externalSaderNumber");
        }
        if (extracted.externalSaderDate) {
          next.externalSaderDate = extracted.externalSaderDate;
          filled.add("externalSaderDate");
        } else if (extracted.documentDate) {
          next.externalSaderDate = extracted.documentDate;
          filled.add("externalSaderDate");
        }
        next.fullText = extracted.fullText || "";
        next.pageCount = extracted.pageCount || 1;
        next.searchKeywords = extracted.searchKeywords || [];
        return next;
      });

      setAiFields(filled);
      setStatusMsg({
        type: "success",
        text: "تم استخراج بيانات المستند تلقائيًا عبر Gemini AI. راجع الحقول ثم اضغط حفظ.",
      });
    } catch (err) {
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      setStatusMsg({
        type: "error",
        text: isAbort
          ? "تم إلغاء التحليل أو انتهت المهلة. يمكنك إكمال الحقول يدويًا أو المحاولة مرة أخرى."
          : err instanceof Error
          ? err.message
          : "تعذر التحليل التلقائي. يمكنك إكمال الحقول يدويًا وحفظ المستند.",
      });
    } finally {
      clearTimeout(timeoutId);
      if (abortRef.current === controller) abortRef.current = null;
      setAnalyzing(false);
    }
  };

  const handleFilesSelected = (files: File[]) => {
    if (files.length === 0) return;
    const [first, ...rest] = files;
    if (rest.length > 0) {
      setFileQueue((prev) => [...prev, ...rest]);
    }
    loadAndAnalyzeFile(first);
  };

  const handleSubmit = async (
    e: React.FormEvent,
    mode: "finish" | "next" = "finish"
  ) => {
    e.preventDefault();
    if (!selectedFile || !user || !profile) return;

    setSaving(true);
    setStatusMsg(null);

    try {
      let finalSaderNumber: string | null = null;
      let finalSaderDate: string | null = null;
      let finalWaredNumber: string | null = null;
      let finalWaredDate: string | null = null;
      let finalExtNumber: string | null = null;
      let finalExtDate: string | null = null;

      if (values.direction === "sader") {
        finalSaderNumber = values.saderNumber.trim();
        if (!finalSaderNumber) {
          finalSaderNumber = await reserveNextSerialNumber("sader");
        } else {
          reserveNextSerialNumber("sader").catch(() => {});
        }
        finalSaderDate = values.saderDate;
      } else {
        finalWaredNumber = values.waredNumber.trim();
        if (!finalWaredNumber) {
          finalWaredNumber = await reserveNextSerialNumber("wared");
        } else {
          reserveNextSerialNumber("wared").catch(() => {});
        }
        finalWaredDate = values.waredDate;
        finalExtNumber = values.externalSaderNumber.trim();
        finalExtDate = values.externalSaderDate;
      }

      const derivedSubject =
        values.summary
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean)
          ?.slice(0, 140) || "مستند مؤرشف";

      const keywords = buildSearchKeywords({
        subject: derivedSubject,
        summary: values.summary,
        entityName: values.entityName,
        documentType: values.documentType,
        folderName: values.folderName,
        saderNumber: finalSaderNumber,
        saderDate: finalSaderDate,
        waredNumber: finalWaredNumber,
        waredDate: finalWaredDate,
        externalSaderNumber: finalExtNumber,
        externalSaderDate: finalExtDate,
        legacyNotes: values.legacyNotes,
        fullText: values.fullText,
        aiKeywords: values.searchKeywords,
      });

      const linkedParent = values.relatedDocId
        ? linkableDocs.find((d) => d.id === values.relatedDocId) || null
        : null;
      const computedThreadId = linkedParent
        ? linkedParent.threadId || linkedParent.id
        : null;

      const idToken = await getIdToken();
      const docId = await uploadPdfAndCreateDocument(
        selectedFile,
        {
          direction: values.direction,
          saderNumber: finalSaderNumber,
          saderDate: finalSaderDate,
          waredNumber: finalWaredNumber,
          waredDate: finalWaredDate,
          externalSaderNumber: finalExtNumber,
          externalSaderDate: finalExtDate,
          subject: derivedSubject,
          summary: values.summary.trim(),
          entityName: values.entityName.trim(),
          documentType: values.documentType.trim(),
          folderName: values.folderName.trim(),
          actionStatus: values.actionStatus,
          confidentiality: values.confidentiality,
          relatedDocId: linkedParent ? linkedParent.id : null,
          threadId: computedThreadId,
          legacyNotes: values.legacyNotes.trim(),
          fullText: values.fullText,
          searchKeywords: keywords,
          pageCount: values.pageCount || 1,
          aiExtractedFields: Array.from(aiFields),
          createdBy: {
            uid: user.uid,
            name: profile.displayName,
            email: profile.email,
          },
          syncedToLegacy: false,
          legacyId: null,
        },
        idToken
      );

      // Ensure parent document joins the same thread & marks as replied if applicable
      if (linkedParent) {
        linkDocumentsInThread(
          {
            id: docId,
            direction: values.direction,
            saderNumber: finalSaderNumber,
            saderDate: finalSaderDate,
            waredNumber: finalWaredNumber,
            waredDate: finalWaredDate,
            externalSaderNumber: finalExtNumber,
            externalSaderDate: finalExtDate,
            subject: derivedSubject,
            summary: values.summary.trim(),
            entityName: values.entityName.trim(),
            documentType: values.documentType.trim(),
            folderName: values.folderName.trim(),
            legacyNotes: values.legacyNotes.trim(),
            fullText: values.fullText,
            searchKeywords: keywords,
            storagePath: "",
            pdfUrl: "",
            originalFilename: selectedFile.name,
            pageCount: values.pageCount || 1,
            aiExtractedFields: [],
            createdBy: { uid: user.uid, name: profile.displayName, email: profile.email },
            createdAt: null,
            syncedToLegacy: false,
            legacyId: null,
            relatedDocId: linkedParent.id,
            threadId: computedThreadId,
          },
          linkedParent
        ).catch(() => {});
      }

      window.localStorage.removeItem(DRAFT_KEY);
      setSavedCount((c) => c + 1);

      if (mode === "next") {
        // Reset form cleanly and auto-load the next queued PDF if any
        const nextDefaults = createDefaultValues(getTodayIsoDate(), values.direction);
        setValues(nextDefaults);
        setAiFields(new Set());
        setAiSuggestedEntity("");
        setAiSuggestedFolder("");
        setDuplicateDoc(null);

        if (fileQueue.length > 0) {
          const [nextFile, ...remaining] = fileQueue;
          setFileQueue(remaining);
          loadAndAnalyzeFile(nextFile);
        } else {
          if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
          setSelectedFile(null);
          setPdfObjectUrl(null);
          setStatusMsg({
            type: "success",
            text: `تم حفظ المستند بنجاح (#${savedCount + 1}). ارفع المستند التالي الآن.`,
          });
        }
      } else {
        router.push(`/archive?docId=${docId}`);
      }
    } catch (err) {
      setStatusMsg({
        type: "error",
        text:
          err instanceof Error
            ? `تعذر حفظ المستند: ${err.message}`
            : "حدث خطأ غير متوقع أثناء الحفظ.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DirectionToggle value={values.direction} onChange={handleDirectionChange} />

        <div className="flex items-center gap-2">
          {savedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 text-[11.5px] font-medium text-ok ring-1 ring-inset ring-ok/25">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              تم حفظ {savedCount} في هذه الجلسة
            </span>
          )}
          <button type="button" onClick={handleResetDraft} className="btn btn-ghost btn-sm">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            مسح المسودة
          </button>
        </div>
      </div>

      {/* Bulk Multi-PDF Queue Bar */}
      {fileQueue.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 px-4 py-2.5">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-fg">
            <Files className="h-4 w-4 text-ai" aria-hidden />
            قائمة الانتظار ({fileQueue.length} ملف متبقي):
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            {fileQueue.slice(0, 6).map((f, idx) => (
              <span
                key={`${f.name}-${idx}`}
                className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-0.5 text-[11.5px] text-muted"
              >
                <span className="max-w-[130px] truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    setFileQueue((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="text-faint hover:text-danger"
                  aria-label="إزالة من القائمة"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {fileQueue.length > 6 && (
              <span className="text-[11.5px] text-faint">+{fileQueue.length - 6} أخرى</span>
            )}
          </div>
        </div>
      )}

      {statusMsg && (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-[12.5px] font-medium ${
            statusMsg.type === "success"
              ? "border-ai/30 bg-ai/10 text-fg"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-ai" aria-hidden />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Balanced 2-Column Workspace: Right (55%) Form | Left (45%) Unified Upload & PDF Preview */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]">
        <IntakeForm
          values={values}
          onChange={setValues}
          aiFields={aiFields}
          aiSuggestedEntity={aiSuggestedEntity}
          aiSuggestedFolder={aiSuggestedFolder}
          entityOptions={entityOptions}
          folderOptions={folderOptions}
          documentTypeOptions={documentTypeOptions}
          onQuickAddEntity={handleQuickAddEntity}
          onQuickAddDocumentType={handleQuickAddDocumentType}
          onQuickAddFolder={handleQuickAddFolder}
          linkableDocs={linkableDocs}
          duplicateDoc={duplicateDoc}
          canMarkConfidential={profile?.role === "admin"}
          queueRemaining={fileQueue.length}
          saving={saving}
          canSave={Boolean(selectedFile) && !analyzing}
          onSubmit={handleSubmit}
        />

        <div className="xl:sticky xl:top-20 xl:h-[calc(100vh-6.5rem)]">
          <PdfViewer
            objectUrl={pdfObjectUrl}
            filename={selectedFile?.name}
            pageCount={values.pageCount}
            analyzing={analyzing}
            onCancelAnalyze={handleCancelAnalyze}
            onFilesSelected={handleFilesSelected}
          />
        </div>
      </div>
    </div>
  );
}
