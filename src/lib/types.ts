import type { Timestamp } from "firebase/firestore";

/**
 * Exact organizational business definitions:
 * - "sader" (صادر): Incoming papers received by us from external entities.
 * - "wared" (وارد): Outgoing papers sent by us / external dual-reference papers.
 */
export type CorrespondenceDirection = "sader" | "wared";

export type ActionStatus = "pending_action" | "replied" | "archived";

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  pending_action: "قيد الإجراء",
  replied: "تم الرد",
  archived: "محفوظ",
};

export type ConfidentialityLevel = "normal" | "confidential";

export const CONFIDENTIALITY_LABELS: Record<ConfidentialityLevel, string> = {
  normal: "عادي (متاح للجميع)",
  confidential: "سري (للإدارة العليا)",
};

export type UserRole = "admin" | "editor" | "viewer";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt?: Timestamp | string | null;
}

export interface DocumentCreator {
  uid: string;
  name: string;
  email: string;
}

export interface ArchiveDocument {
  id: string;
  direction: CorrespondenceDirection;

  // Sader fields (صادر — Incoming received by us)
  saderNumber: string | null;
  saderDate: string | null;

  // Wared fields (وارد — Outgoing / External dual-ref papers)
  waredNumber: string | null;
  waredDate: string | null;
  externalSaderNumber: string | null;
  externalSaderDate: string | null;

  // Shared core metadata
  subject: string;
  summary: string;
  entityName: string;
  documentType: string;
  folderName: string;
  legacyNotes: string;
  fullText: string;
  searchKeywords: string[];

  // File & storage metadata
  storagePath: string;
  pdfUrl: string;
  originalFilename: string;
  pageCount: number;

  // AI & audit metadata
  aiExtractedFields: string[];
  createdBy: DocumentCreator;
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;

  // Follow-up workflow status, confidentiality & linked correspondence threads
  actionStatus?: ActionStatus;
  confidentiality?: ConfidentialityLevel;
  relatedDocId?: string | null;
  threadId?: string | null;

  // Legacy .aspx SQL Server sync metadata
  syncedToLegacy: boolean;
  legacyId: number | null;
  syncedAt?: Timestamp | null;
}

export type NewArchiveDocumentInput = Omit<
  ArchiveDocument,
  "id" | "createdAt" | "updatedAt" | "syncedAt"
>;

export interface FolderItem {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  createdAt?: Timestamp | null;
}

export interface EntityItem {
  id: string;
  name: string;
  category?: string;
  documentCount: number;
  createdAt?: Timestamp | null;
}

export interface DocumentTypeItem {
  id: string;
  name: string;
  isDefault?: boolean;
  documentCount: number;
}

export interface GeminiExtractionResult {
  subject: string;
  summary: string;
  entityName: string;
  documentType: string;
  suggestedFolder: string;
  waredNumber: string;
  waredDate: string;
  saderNumber: string;
  saderDate: string;
  externalSaderNumber: string;
  externalSaderDate: string;
  documentDate: string;
  pageCount: number;
  fullText: string;
  searchKeywords: string[];
}

export interface ArchiveFilterState {
  search: string;
  direction: "all" | CorrespondenceDirection;
  entityName: string;
  documentType: string;
  folderName: string;
  dateFrom: string;
  dateTo: string;
  syncStatus: "all" | "synced" | "pending";
  actionStatus?: "all" | ActionStatus;
}

export const DEFAULT_DOCUMENT_TYPES: string[] = [
  "خطاب رسمي",
  "عقد",
  "مستخلص مالي",
  "مناقصة / أمر توريد",
  "فاتورة",
  "محضر اجتماع",
  "مذكرة داخلية",
  "تقرير",
  "أخرى",
];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "مدير النظام",
  editor: "مدخل بيانات",
  viewer: "مطلع فقط",
};

