"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Download,
  Printer,
  QrCode,
  ExternalLink,
  FileText,
  Sparkles,
  Building2,
  Folder,
  Tag,
  User2,
  CalendarClock,
  Server,
  Copy,
  Check,
  Pencil,
  Save,
  Loader2,
  Link2,
  Unlink,
  GitBranch,
} from "lucide-react";
import {
  ACTION_STATUS_LABELS,
  type ActionStatus,
  type ArchiveDocument,
} from "@/lib/types";
import { DirectionBadge } from "@/components/ui/DirectionBadge";
import { LtrCode } from "@/components/ui/LtrCode";
import { StatusPill, Tabs } from "@/components/ui/primitives";
import { BarcodePrintModal } from "@/components/archive/BarcodePrintModal";
import {
  fetchThreadDocuments,
  linkDocumentsInThread,
  unlinkDocumentFromThread,
  updateArchiveDocument,
} from "@/lib/archive/queries";
import { toAsciiDigits } from "@/lib/archive/normalize";
import { useAuth } from "@/context/AuthContext";
import { cn, formatTimestampArabic } from "@/lib/utils";

interface DocumentDrawerProps {
  doc: ArchiveDocument | null;
  onClose: () => void;
  onUpdated?: (updated: ArchiveDocument) => void;
  onSelectDoc?: (doc: ArchiveDocument) => void;
  allDocuments?: ArchiveDocument[];
  folders?: string[];
  entities?: string[];
  documentTypes?: string[];
}

type DrawerTab = "details" | "text";

export function DocumentDrawer({
  doc,
  onClose,
  onUpdated,
  onSelectDoc,
  allDocuments = [],
  folders = [],
  entities = [],
  documentTypes = [],
}: DocumentDrawerProps) {
  const { profile } = useAuth();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";

  const dialogRef = useRef<HTMLDialogElement>(null);
  const pdfIframeRef = useRef<HTMLIFrameElement>(null);
  const [showBarcode, setShowBarcode] = useState(false);
  const [tab, setTab] = useState<DrawerTab>("details");
  const [copied, setCopied] = useState(false);

  // Correspondence Thread state
  const [threadDocs, setThreadDocs] = useState<ArchiveDocument[]>([]);
  const [linkingMode, setLinkingMode] = useState(false);
  const [selectedLinkId, setSelectedLinkId] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);

  // Inline Quick Edit state
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [editDraft, setEditDraft] = useState({
    saderNumber: "",
    saderDate: "",
    waredNumber: "",
    waredDate: "",
    externalSaderNumber: "",
    externalSaderDate: "",
    entityName: "",
    documentType: "",
    folderName: "",
    actionStatus: "archived" as ActionStatus,
    summary: "",
    legacyNotes: "",
  });

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (doc && !dlg.open) {
      setTab("details");
      setEditing(false);
      setEditError("");
      dlg.showModal();
    }
    if (!doc && dlg.open) dlg.close();
  }, [doc]);

  useEffect(() => {
    if (!doc) return;
    setEditDraft({
      saderNumber: doc.saderNumber || "",
      saderDate: doc.saderDate || "",
      waredNumber: doc.waredNumber || "",
      waredDate: doc.waredDate || "",
      externalSaderNumber: doc.externalSaderNumber || "",
      externalSaderDate: doc.externalSaderDate || "",
      entityName: doc.entityName || "",
      documentType: doc.documentType || "",
      folderName: doc.folderName || "",
      actionStatus: doc.actionStatus || "archived",
      summary: doc.summary || doc.subject || "",
      legacyNotes: doc.legacyNotes || "",
    });
    setEditing(false);
    setEditError("");
    setLinkingMode(false);
    setSelectedLinkId("");
    if (doc.threadId) {
      fetchThreadDocuments(doc)
        .then(setThreadDocs)
        .catch(() => setThreadDocs([]));
    } else {
      setThreadDocs([]);
    }
  }, [doc]);

  // Light-dismiss when press & release happen outside the panel
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    let pressedOutside = false;
    const outside = (e: PointerEvent) => {
      const panel = dlg.firstElementChild as HTMLElement | null;
      if (!panel) return false;
      const r = panel.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };
    const down = (e: PointerEvent) => (pressedOutside = outside(e));
    const up = (e: PointerEvent) => {
      if (pressedOutside && outside(e)) dlg.close();
    };
    dlg.addEventListener("pointerdown", down);
    dlg.addEventListener("pointerup", up);
    return () => {
      dlg.removeEventListener("pointerdown", down);
      dlg.removeEventListener("pointerup", up);
    };
  }, []);

  const isSader = doc?.direction === "sader";
  const refNum = doc ? (isSader ? doc.saderNumber : doc.waredNumber) : null;

  const handleCopyRef = async () => {
    if (!refNum) return;
    try {
      await navigator.clipboard.writeText(refNum);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  const handlePrintPdf = () => {
    if (!doc?.pdfUrl) return;
    try {
      const win = pdfIframeRef.current?.contentWindow;
      if (win && tab === "details") {
        win.focus();
        win.print();
        return;
      }
    } catch {
      // cross-origin fallback
    }
    const printWin = window.open(doc.pdfUrl, "_blank", "noopener,noreferrer");
    if (printWin) {
      printWin.addEventListener("load", () => {
        try {
          printWin.print();
        } catch {
          // ignore
        }
      });
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc || !canEdit) return;
    setSavingEdit(true);
    setEditError("");
    try {
      const updated = await updateArchiveDocument(doc.id, doc, {
        saderNumber: isSader ? editDraft.saderNumber.trim() : doc.saderNumber,
        saderDate: isSader ? editDraft.saderDate : doc.saderDate,
        waredNumber: !isSader ? editDraft.waredNumber.trim() : doc.waredNumber,
        waredDate: !isSader ? editDraft.waredDate : doc.waredDate,
        externalSaderNumber: !isSader
          ? editDraft.externalSaderNumber.trim()
          : doc.externalSaderNumber,
        externalSaderDate: !isSader
          ? editDraft.externalSaderDate
          : doc.externalSaderDate,
        entityName: editDraft.entityName.trim(),
        documentType: editDraft.documentType.trim(),
        folderName: editDraft.folderName.trim(),
        actionStatus: editDraft.actionStatus,
        summary: editDraft.summary.trim(),
        subject:
          editDraft.summary
            .split("\n")
            .map((l) => l.trim())
            .find(Boolean)
            ?.slice(0, 140) || doc.subject,
        legacyNotes: editDraft.legacyNotes.trim(),
      });
      setEditing(false);
      onUpdated?.(updated);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "تعذر حفظ التعديلات."
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleLinkDoc = async () => {
    if (!doc || !selectedLinkId) return;
    const target = allDocuments.find((d) => d.id === selectedLinkId);
    if (!target) return;
    setLinkBusy(true);
    try {
      const threadId = await linkDocumentsInThread(doc, target);
      const updatedDoc: ArchiveDocument = {
        ...doc,
        relatedDocId: target.id,
        threadId,
      };
      onUpdated?.(updatedDoc);
      const refreshed = await fetchThreadDocuments(updatedDoc);
      setThreadDocs(refreshed.length > 0 ? refreshed : [target, updatedDoc]);
      setLinkingMode(false);
      setSelectedLinkId("");
    } finally {
      setLinkBusy(false);
    }
  };

  const handleUnlinkDoc = async () => {
    if (!doc) return;
    setLinkBusy(true);
    try {
      await unlinkDocumentFromThread(doc.id);
      const updatedDoc: ArchiveDocument = {
        ...doc,
        relatedDocId: null,
        threadId: null,
      };
      onUpdated?.(updatedDoc);
      setThreadDocs([]);
    } finally {
      setLinkBusy(false);
    }
  };

  const actionStatus = doc?.actionStatus || "archived";

  return (
    <dialog
      ref={dialogRef}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
    >
      {doc && (
        <div className="flex h-full w-full flex-col border-s border-line bg-panel shadow-pop">
          {/* Executive Header */}
          <header className="shrink-0 border-b border-line bg-panel px-6 pt-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DirectionBadge direction={doc.direction} size="md" showSubtitle />
                  {refNum && (
                    <button
                      type="button"
                      onClick={handleCopyRef}
                      title="نسخ الرقم المرجعي"
                      className="inline-flex items-center gap-1.5 rounded-md border border-line bg-raised px-2 py-0.5 text-[12px] font-semibold text-fg transition-colors hover:border-line-strong"
                    >
                      <LtrCode>{refNum}</LtrCode>
                      {copied ? (
                        <Check className="h-3 w-3 text-ok" aria-hidden />
                      ) : (
                        <Copy className="h-3 w-3 text-faint" aria-hidden />
                      )}
                    </button>
                  )}
                  {actionStatus === "pending_action" ? (
                    <StatusPill tone="warn">
                      {ACTION_STATUS_LABELS.pending_action}
                    </StatusPill>
                  ) : actionStatus === "replied" ? (
                    <StatusPill tone="ok">{ACTION_STATUS_LABELS.replied}</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">
                      {ACTION_STATUS_LABELS.archived}
                    </StatusPill>
                  )}
                  {doc.syncedToLegacy ? (
                    <StatusPill tone="ok">
                      متزامن {doc.legacyId ? `#${doc.legacyId}` : ""}
                    </StatusPill>
                  ) : (
                    <StatusPill tone="warn">بانتظار السيرفر</StatusPill>
                  )}
                </div>

                <h2
                  id="drawer-title"
                  className="mt-2.5 font-display text-[19px] font-bold leading-snug text-fg"
                >
                  {doc.subject}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
                  <Building2 className="h-3.5 w-3.5 text-faint" aria-hidden />
                  <span>{doc.entityName}</span>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab("details");
                      setEditing((prev) => !prev);
                    }}
                    className={cn(
                      "btn btn-sm",
                      editing ? "btn-primary" : "btn-secondary"
                    )}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    {editing ? "إلغاء التعديل" : "تعديل"}
                  </button>
                )}

                {doc.pdfUrl && (
                  <button
                    type="button"
                    onClick={handlePrintPdf}
                    className="btn btn-primary btn-sm"
                  >
                    <Printer className="h-3.5 w-3.5" aria-hidden />
                    طباعة الـ PDF
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowBarcode(true)}
                  className="btn btn-secondary btn-sm"
                >
                  <QrCode className="h-3.5 w-3.5" aria-hidden />
                  ملصق
                </button>

                {doc.pdfUrl && (
                  <a
                    href={doc.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={doc.originalFilename}
                    className="btn btn-secondary btn-sm"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    تحميل
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => dialogRef.current?.close()}
                  className="btn btn-ghost btn-icon btn-sm"
                  aria-label="إغلاق"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <Tabs<DrawerTab>
              className="mt-4 border-b-0"
              value={tab}
              onChange={setTab}
              items={[
                { id: "details", label: "البيانات والمعاينة" },
                { id: "text", label: "النص الكامل (OCR)" },
              ]}
            />
          </header>

          {/* Body */}
          {tab === "details" ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              {/* Right Panel: Quick Edit Form OR Read-Only Executive Cards */}
              <div className="min-h-0 overflow-y-auto p-6">
                {editing ? (
                  <form onSubmit={handleSaveEdit} className="space-y-4">
                    <h3 className="eyebrow">تعديل بيانات المستند</h3>

                    {isSader ? (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">رقم الصادر</label>
                          <input
                            type="text"
                            dir="ltr"
                            required
                            value={editDraft.saderNumber}
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                saderNumber: toAsciiDigits(e.target.value),
                              }))
                            }
                            className="input num font-mono"
                          />
                        </div>
                        <div>
                          <label className="label">تاريخ الصادر</label>
                          <input
                            type="date"
                            dir="ltr"
                            required
                            value={editDraft.saderDate}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, saderDate: e.target.value }))
                            }
                            className="input num font-mono"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label">رقم الوارد</label>
                          <input
                            type="text"
                            dir="ltr"
                            required
                            value={editDraft.waredNumber}
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                waredNumber: toAsciiDigits(e.target.value),
                              }))
                            }
                            className="input num font-mono"
                          />
                        </div>
                        <div>
                          <label className="label">تاريخ الوارد</label>
                          <input
                            type="date"
                            dir="ltr"
                            required
                            value={editDraft.waredDate}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, waredDate: e.target.value }))
                            }
                            className="input num font-mono"
                          />
                        </div>
                        <div>
                          <label className="label">رقم صادر الجهة</label>
                          <input
                            type="text"
                            dir="ltr"
                            required
                            value={editDraft.externalSaderNumber}
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                externalSaderNumber: toAsciiDigits(e.target.value),
                              }))
                            }
                            className="input num font-mono"
                          />
                        </div>
                        <div>
                          <label className="label">تاريخ صادر الجهة</label>
                          <input
                            type="date"
                            dir="ltr"
                            required
                            value={editDraft.externalSaderDate}
                            onChange={(e) =>
                              setEditDraft((d) => ({
                                ...d,
                                externalSaderDate: e.target.value,
                              }))
                            }
                            className="input num font-mono"
                          />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">الجهة</label>
                        {entities.length > 0 ? (
                          <select
                            required
                            value={editDraft.entityName}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, entityName: e.target.value }))
                            }
                            className="input"
                          >
                            {!entities.includes(editDraft.entityName) && (
                              <option value={editDraft.entityName}>{editDraft.entityName}</option>
                            )}
                            {entities.map((ent) => (
                              <option key={ent} value={ent}>
                                {ent}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            required
                            value={editDraft.entityName}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, entityName: e.target.value }))
                            }
                            className="input"
                          />
                        )}
                      </div>
                      <div>
                        <label className="label">نوع المستند</label>
                        <select
                          required
                          value={editDraft.documentType}
                          onChange={(e) =>
                            setEditDraft((d) => ({ ...d, documentType: e.target.value }))
                          }
                          className="input"
                        >
                          {!documentTypes.includes(editDraft.documentType) && (
                            <option value={editDraft.documentType}>{editDraft.documentType}</option>
                          )}
                          {documentTypes.map((dt) => (
                            <option key={dt} value={dt}>
                              {dt}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label">الملف / الحافظة</label>
                        {folders.length > 0 ? (
                          <select
                            required
                            value={editDraft.folderName}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, folderName: e.target.value }))
                            }
                            className="input"
                          >
                            {!folders.includes(editDraft.folderName) && (
                              <option value={editDraft.folderName}>{editDraft.folderName}</option>
                            )}
                            {folders.map((f) => (
                              <option key={f} value={f}>
                                {f}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            required
                            value={editDraft.folderName}
                            onChange={(e) =>
                              setEditDraft((d) => ({ ...d, folderName: e.target.value }))
                            }
                            className="input"
                          />
                        )}
                      </div>
                      <div>
                        <label className="label">حالة المتابعة</label>
                        <select
                          value={editDraft.actionStatus}
                          onChange={(e) =>
                            setEditDraft((d) => ({
                              ...d,
                              actionStatus: e.target.value as ActionStatus,
                            }))
                          }
                          className="input"
                        >
                          <option value="archived">{ACTION_STATUS_LABELS.archived}</option>
                          <option value="pending_action">
                            {ACTION_STATUS_LABELS.pending_action}
                          </option>
                          <option value="replied">{ACTION_STATUS_LABELS.replied}</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="label">الوصف والموضوع</label>
                      <textarea
                        rows={4}
                        required
                        value={editDraft.summary}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, summary: e.target.value }))
                        }
                        className="input"
                      />
                    </div>

                    <div>
                      <label className="label">ملاحظات المتابعة / الأرشيف</label>
                      <textarea
                        rows={2}
                        value={editDraft.legacyNotes}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, legacyNotes: e.target.value }))
                        }
                        className="input"
                      />
                    </div>

                    {editError && (
                      <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                        {editError}
                      </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="btn btn-secondary"
                      >
                        إلغاء
                      </button>
                      <button
                        type="submit"
                        disabled={savingEdit}
                        className="btn btn-primary"
                      >
                        {savingEdit ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        ) : (
                          <Save className="h-4 w-4" aria-hidden />
                        )}
                        حفظ التعديلات
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-5">
                    <section>
                      <h3 className="eyebrow mb-2.5">الأرقام والتواريخ المرجعية</h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        {isSader ? (
                          <>
                            <RefTile
                              label="رقم الصادر / القيد"
                              value={doc.saderNumber}
                              accent="sader"
                            />
                            <RefTile label="تاريخ الصادر" value={doc.saderDate} />
                          </>
                        ) : (
                          <>
                            <RefTile
                              label="رقم الوارد"
                              value={doc.waredNumber}
                              accent="wared"
                            />
                            <RefTile label="تاريخ الوارد" value={doc.waredDate} />
                            <RefTile
                              label="رقم صادر الجهة"
                              value={doc.externalSaderNumber}
                              accent="neutral"
                            />
                            <RefTile
                              label="تاريخ صادر الجهة"
                              value={doc.externalSaderDate}
                            />
                          </>
                        )}
                      </div>
                    </section>

                    <section className="rounded-xl border border-line bg-bg/50 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="eyebrow">الوصف والملخص التنفيذي</h3>
                        {doc.aiExtractedFields?.includes("summary") && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-ai/10 px-2 py-0.5 text-[10.5px] font-medium text-ai">
                            <Sparkles className="h-2.5 w-2.5" aria-hidden />
                            Gemini
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-[13px] leading-7 text-fg">
                        {doc.summary || "لا يوجد ملخص مسجل."}
                      </p>
                    </section>

                    <section>
                      <h3 className="eyebrow mb-2.5">التصنيف وسجل الأرشفة</h3>
                      <div className="grid grid-cols-2 gap-2.5">
                        <InfoTile icon={Tag} label="نوع المستند" value={doc.documentType} />
                        <InfoTile icon={Folder} label="الملف / الحافظة" value={doc.folderName} />
                        <InfoTile
                          icon={FileText}
                          label="عدد الصفحات"
                          value={<LtrCode>{doc.pageCount}</LtrCode>}
                        />
                        <InfoTile
                          icon={Server}
                          label="السيرفر القديم"
                          value={
                            doc.legacyId ? (
                              <LtrCode>#{doc.legacyId}</LtrCode>
                            ) : (
                              "بانتظار المزامنة"
                            )
                          }
                        />
                        <InfoTile
                          icon={User2}
                          label="أُرشف بواسطة"
                          value={doc.createdBy?.name || doc.createdBy?.email || "—"}
                        />
                        <InfoTile
                          icon={CalendarClock}
                          label="تاريخ الأرشفة"
                          value={formatTimestampArabic(doc.createdAt)}
                        />
                      </div>
                    </section>

                    {doc.legacyNotes && (
                      <section className="rounded-xl border border-wared/25 bg-wared/[0.05] p-4">
                        <h3 className="eyebrow mb-1.5 text-wared">ملاحظات الأرشيف</h3>
                        <p className="whitespace-pre-wrap text-[13px] leading-6 text-fg">
                          {doc.legacyNotes}
                        </p>
                      </section>
                    )}

                    {/* Linked Correspondence Thread Timeline (ربط المراسلات والردود) */}
                    <section className="rounded-xl border border-line bg-bg/40 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="eyebrow flex items-center gap-1.5">
                          <GitBranch className="h-3.5 w-3.5 text-sader" aria-hidden />
                          سجل المراسلات المرتبطة ({threadDocs.length})
                        </h3>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            {doc.threadId && (
                              <button
                                type="button"
                                disabled={linkBusy}
                                onClick={handleUnlinkDoc}
                                className="btn btn-ghost btn-sm text-faint hover:text-danger"
                                title="فك ارتباط هذا المستند عن السلسلة"
                              >
                                <Unlink className="h-3 w-3" aria-hidden />
                                فك الربط
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setLinkingMode((p) => !p)}
                              className="btn btn-secondary btn-sm"
                            >
                              <Link2 className="h-3 w-3" aria-hidden />
                              {linkingMode ? "إلغاء" : "ربط بمستند"}
                            </button>
                          </div>
                        )}
                      </div>

                      {linkingMode && (
                        <div className="mb-3 flex items-center gap-2">
                          <select
                            value={selectedLinkId}
                            onChange={(e) => setSelectedLinkId(e.target.value)}
                            className="input h-9 flex-1 text-xs"
                          >
                            <option value="">اختر المستند الأصلي أو الرد لربطه…</option>
                            {allDocuments
                              .filter((d) => d.id !== doc.id)
                              .slice(0, 80)
                              .map((d) => {
                                const num =
                                  d.direction === "sader" ? d.saderNumber : d.waredNumber;
                                return (
                                  <option key={d.id} value={d.id}>
                                    [{d.direction === "sader" ? "صادر" : "وارد"} {num || "—"}]{" "}
                                    {d.subject.slice(0, 55)}
                                  </option>
                                );
                              })}
                          </select>
                          <button
                            type="button"
                            disabled={!selectedLinkId || linkBusy}
                            onClick={handleLinkDoc}
                            className="btn btn-primary btn-sm shrink-0"
                          >
                            {linkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "ربط"}
                          </button>
                        </div>
                      )}

                      {threadDocs.length <= 1 && !linkingMode ? (
                        <p className="text-[12px] text-faint">
                          لا توجد ردود أو مراسلات مرتبطة بهذا المستند بعد.
                        </p>
                      ) : (
                        <ol className="relative space-y-2 border-s-2 border-line ps-4">
                          {threadDocs.map((item) => {
                            const isCurrent = item.id === doc.id;
                            const num =
                              item.direction === "sader"
                                ? item.saderNumber
                                : item.waredNumber;
                            const dt =
                              item.direction === "sader" ? item.saderDate : item.waredDate;
                            return (
                              <li key={item.id} className="relative">
                                <span
                                  className={cn(
                                    "absolute -start-[21px] top-3 h-2.5 w-2.5 rounded-full ring-2 ring-panel",
                                    isCurrent ? "bg-fg" : "bg-faint"
                                  )}
                                  aria-hidden
                                />
                                <button
                                  type="button"
                                  disabled={isCurrent}
                                  onClick={() => onSelectDoc?.(item)}
                                  className={cn(
                                    "flex w-full flex-col gap-1 rounded-lg border p-2.5 text-start transition-colors",
                                    isCurrent
                                      ? "border-fg/30 bg-panel"
                                      : "border-line bg-panel/60 hover:border-line-strong hover:bg-raised"
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <DirectionBadge direction={item.direction} />
                                      <LtrCode className="text-[11.5px] font-semibold text-fg">
                                        {num || "—"}
                                      </LtrCode>
                                      {isCurrent && (
                                        <span className="rounded bg-raised px-1.5 py-px text-[10px] font-medium text-muted">
                                          الحالي
                                        </span>
                                      )}
                                    </div>
                                    <LtrCode className="text-[11px] text-faint">
                                      {dt || "—"}
                                    </LtrCode>
                                  </div>
                                  <p className="truncate text-[12px] font-medium text-fg">
                                    {item.subject}
                                  </p>
                                </button>
                              </li>
                            );
                          })}
                        </ol>
                      )}
                    </section>
                  </div>
                )}
              </div>

              {/* Left Interactive PDF Stage */}
              <div className="flex min-h-[460px] flex-col border-t border-line bg-raised/40 lg:border-s lg:border-t-0">
                <div className="flex items-center justify-between gap-2 border-b border-line bg-panel/80 px-4 py-2 text-[12px]">
                  <span className="truncate font-medium text-fg">
                    {doc.originalFilename}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    {doc.pdfUrl && (
                      <>
                        <button
                          type="button"
                          onClick={handlePrintPdf}
                          className="btn btn-ghost btn-sm"
                        >
                          <Printer className="h-3.5 w-3.5" aria-hidden />
                          طباعة
                        </button>
                        <a
                          href={doc.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm"
                        >
                          فتح مستقل
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {doc.pdfUrl ? (
                  <iframe
                    ref={pdfIframeRef}
                    src={`${doc.pdfUrl}#toolbar=1&navpanes=0`}
                    title={`معاينة: ${doc.subject}`}
                    className="w-full flex-1 bg-bg"
                  />
                ) : (
                  <div className="flex flex-1 items-center justify-center text-[13px] text-faint">
                    لا يوجد ملف مرفق
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {doc.fullText ? (
                <pre className="whitespace-pre-wrap rounded-xl border border-line bg-bg p-5 font-sans text-[13px] leading-7 text-fg">
                  {doc.fullText}
                </pre>
              ) : (
                <p className="py-16 text-center text-[13px] text-faint">
                  لم يتم استخراج نص لهذا المستند.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {doc && showBarcode && (
        <BarcodePrintModal doc={doc} onClose={() => setShowBarcode(false)} />
      )}
    </dialog>
  );
}

function RefTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | null;
  accent?: "sader" | "wared" | "neutral";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-panel p-3.5 shadow-card",
        accent === "sader" && "border-t-2 border-t-sader",
        accent === "wared" && "border-t-2 border-t-wared"
      )}
    >
      <p className="text-[11px] font-medium text-faint">{label}</p>
      <LtrCode
        className={cn(
          "mt-1 font-mono text-fg",
          accent ? "text-[16px] font-bold" : "text-[13.5px] font-semibold"
        )}
      >
        {value || "—"}
      </LtrCode>
    </div>
  );
}

function InfoTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-bg/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-faint">
        <Icon className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 truncate text-[12.5px] font-semibold text-fg">{value}</div>
    </div>
  );
}
