import {
  ACTION_STATUS_LABELS,
  CONFIDENTIALITY_LABELS,
  type ArchiveDocument,
  type DocumentTypeItem,
  type EntityItem,
  type FolderItem,
} from "@/lib/types";

function escapeCsvCell(value: string | number | null | undefined): string {
  const str = String(value ?? "").replace(/\r?\n/g, " ").trim();
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports archive documents to an Arabic-safe UTF-8 BOM CSV file
 * that opens cleanly in Microsoft Excel with zero mojibake.
 */
export function exportDocumentsToExcelCsv(
  docs: ArchiveDocument[],
  filenamePrefix = "archive_register"
): void {
  const headers = [
    "الاتجاه",
    "رقم الصادر / الوارد",
    "التاريخ",
    "رقم صادر الجهة",
    "تاريخ صادر الجهة",
    "الجهة",
    "نوع المستند",
    "الملف / الحافظة",
    "حالة المتابعة",
    "درجة السرية",
    "سلسلة المراسلات",
    "الموضوع والوصف",
    "ملاحظات",
    "حالة السيرفر القديم",
    "رقم السيرفر القديم",
  ];

  const rows = docs.map((d) => {
    const isSader = d.direction === "sader";
    const status = d.actionStatus || "archived";
    return [
      isSader ? "صادر (مستلم)" : "وارد (مرسل)",
      isSader ? d.saderNumber || "" : d.waredNumber || "",
      isSader ? d.saderDate || "" : d.waredDate || "",
      d.externalSaderNumber || "",
      d.externalSaderDate || "",
      d.entityName || "",
      d.documentType || "",
      d.folderName || "",
      ACTION_STATUS_LABELS[status],
      CONFIDENTIALITY_LABELS[d.confidentiality || "normal"],
      d.threadId || "",
      d.summary || d.subject || "",
      d.legacyNotes || "",
      d.syncedToLegacy ? "متزامن" : "بانتظار المزامنة",
      d.legacyId ?? "",
    ].map(escapeCsvCell);
  });

  // UTF-8 BOM (\uFEFF) ensures Microsoft Excel renders Arabic columns cleanly
  const csvContent =
    "\uFEFF" + [headers.map(escapeCsvCell).join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `${filenamePrefix}_${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports a complete offline JSON backup snapshot of all documents, folders,
 * entities, document types, and linked threads for local server archiving.
 */
export function exportFullBackupJson(payload: {
  documents: ArchiveDocument[];
  folders: FolderItem[];
  entities: EntityItem[];
  documentTypes: DocumentTypeItem[];
}): void {
  const backup = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      documents: payload.documents.length,
      folders: payload.folders.length,
      entities: payload.entities.length,
      documentTypes: payload.documentTypes.length,
    },
    ...payload,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateStamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `mostkbl_archive_backup_${dateStamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Opens a clean, official RTL printable correspondence register (كشف الصادر والوارد)
 * ready for management sign-off.
 */
export function printOfficialRegister(
  docs: ArchiveDocument[],
  title = "كشف سجل الصادر والوارد"
): void {
  const win = window.open("", "_blank", "width=1100,height=800");
  if (!win) return;

  const printedAt = new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  const saderCount = docs.filter((d) => d.direction === "sader").length;
  const waredCount = docs.filter((d) => d.direction === "wared").length;

  const rowsHtml = docs
    .map((d, idx) => {
      const isSader = d.direction === "sader";
      const refNum = isSader ? d.saderNumber || "—" : d.waredNumber || "—";
      const refDate = isSader ? d.saderDate || "—" : d.waredDate || "—";
      const extNum = !isSader && d.externalSaderNumber ? d.externalSaderNumber : "—";
      const statusLabel = ACTION_STATUS_LABELS[d.actionStatus || "archived"];
      return `
        <tr>
          <td class="num">${idx + 1}</td>
          <td>${isSader ? "صادر" : "وارد"}</td>
          <td class="num"><strong>${escapeHtml(refNum)}</strong></td>
          <td class="num">${escapeHtml(extNum)}</td>
          <td class="num">${escapeHtml(refDate)}</td>
          <td>${escapeHtml(d.entityName || "—")}</td>
          <td>${escapeHtml(d.subject || "—")}</td>
          <td>${escapeHtml(d.folderName || "—")}</td>
          <td>${escapeHtml(statusLabel)}</td>
        </tr>
      `;
    })
    .join("");

  win.document.write(`<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    body { font-family: "IBM Plex Sans Arabic", "Cairo", Tahoma, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11.5px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 14px; }
    .header h1 { margin: 0 0 4px; font-size: 18px; }
    .header p { margin: 0; color: #475569; font-size: 11px; }
    .stats { display: flex; gap: 16px; font-size: 11.5px; }
    .stat { border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 10px; background: #f8fafc; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; font-size: 11px; }
    tr:nth-child(even) td { background: #fafafa; }
    .num { direction: ltr; unicode-bidi: isolate; text-align: center; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .signatures { margin-top: 28px; display: flex; justify-content: space-between; padding: 0 32px; font-size: 12px; font-weight: 600; }
    .sig-box { text-align: center; min-width: 180px; }
    .sig-line { margin-top: 34px; border-top: 1px dashed #64748b; padding-top: 6px; color: #475569; font-weight: 400; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(title)}</h1>
      <p>تاريخ الطباعة: ${escapeHtml(printedAt)}</p>
    </div>
    <div class="stats">
      <div class="stat">الإجمالي: <strong>${docs.length}</strong></div>
      <div class="stat">صادر: <strong>${saderCount}</strong></div>
      <div class="stat">وارد: <strong>${waredCount}</strong></div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:32px">#</th>
        <th style="width:55px">الاتجاه</th>
        <th style="width:95px">رقم القيد</th>
        <th style="width:95px">صادر الجهة</th>
        <th style="width:85px">التاريخ</th>
        <th style="width:160px">الجهة</th>
        <th>الموضوع</th>
        <th style="width:130px">الملف</th>
        <th style="width:75px">الحالة</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="9" style="text-align:center;padding:24px;">لا توجد مستندات</td></tr>'}
    </tbody>
  </table>
  <div class="signatures">
    <div class="sig-box">مسؤول الأرشيف<div class="sig-line">التوقيع / التاريخ</div></div>
    <div class="sig-box">مدير الشؤون الإدارية<div class="sig-line">التوقيع / التاريخ</div></div>
    <div class="sig-box">الاعتماد التنفيذي<div class="sig-line">التوقيع / الختم</div></div>
  </div>
  <script>window.onload = function() { window.print(); };</script>
</body>
</html>`);
  win.document.close();
}

