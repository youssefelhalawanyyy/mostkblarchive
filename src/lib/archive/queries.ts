import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  increment,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getFirebaseDb, getFirebaseStorage } from "@/lib/firebase/client";
import {
  DEFAULT_DOCUMENT_TYPES,
  type ArchiveDocument,
  type ArchiveFilterState,
  type DocumentTypeItem,
  type EntityItem,
  type FolderItem,
  type NewArchiveDocumentInput,
} from "@/lib/types";
import { buildSearchKeywords, normalizeArabicText, toAsciiDigits } from "@/lib/archive/normalize";
import { sanitizeFilename, slugifyTaxonomyId } from "@/lib/utils";

// Shared in-memory documents cache for 0ms instant navigation between Dashboard & Archive
const DOCS_CACHE_TTL_MS = 2 * 60 * 1000;
let documentsCache: { expiresAt: number; docs: ArchiveDocument[] } | null = null;

export function getCachedArchiveDocuments(): ArchiveDocument[] | null {
  if (documentsCache && Date.now() < documentsCache.expiresAt) {
    return documentsCache.docs;
  }
  return null;
}

export function invalidateDocumentsCache(): void {
  documentsCache = null;
}

export async function fetchArchiveDocuments(
  filters?: Partial<ArchiveFilterState>,
  maxResults = 60,
  forceRefresh = false
): Promise<ArchiveDocument[]> {
  const hasFilters = Boolean(
    filters &&
      (filters.search ||
        (filters.direction && filters.direction !== "all") ||
        filters.entityName ||
        filters.documentType ||
        filters.folderName ||
        filters.dateFrom ||
        filters.dateTo ||
        (filters.syncStatus && filters.syncStatus !== "all"))
  );

  if (!forceRefresh && !hasFilters && documentsCache && Date.now() < documentsCache.expiresAt) {
    return documentsCache.docs.slice(0, maxResults);
  }

  const db = getFirebaseDb();
  const constraints: QueryConstraint[] = [];

  if (filters?.direction && filters.direction !== "all") {
    constraints.push(where("direction", "==", filters.direction));
  }
  if (filters?.syncStatus === "synced") {
    constraints.push(where("syncedToLegacy", "==", true));
  } else if (filters?.syncStatus === "pending") {
    constraints.push(where("syncedToLegacy", "==", false));
  }

  // If a search term is provided, try Firestore array-contains-any on the first few normalized tokens
  const searchTokens = filters?.search
    ? normalizeArabicText(filters.search)
        .split(/[\s,،؛]+/)
        .filter((t) => t.length >= 2)
        .slice(0, 10)
    : [];

  if (searchTokens.length > 0 && constraints.length === 0) {
    constraints.push(where("searchKeywords", "array-contains-any", searchTokens));
  }

  constraints.push(orderBy("createdAt", "desc"));
  constraints.push(limit(maxResults));

  const q = query(collection(db, "documents"), ...constraints);
  const snap = await getDocs(q);

  let results: ArchiveDocument[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ArchiveDocument, "id">),
  }));

  // Client-side refinement for multi-facet filters (entity, folder, type, date range, substring search)
  if (filters) {
    if (filters.entityName) {
      results = results.filter((r) => r.entityName === filters.entityName);
    }
    if (filters.documentType) {
      results = results.filter((r) => r.documentType === filters.documentType);
    }
    if (filters.folderName) {
      results = results.filter((r) => r.folderName === filters.folderName);
    }
    if (filters.dateFrom) {
      results = results.filter((r) => {
        const docDate = r.direction === "sader" ? r.saderDate : r.waredDate;
        return docDate ? docDate >= filters.dateFrom! : false;
      });
    }
    if (filters.dateTo) {
      results = results.filter((r) => {
        const docDate = r.direction === "sader" ? r.saderDate : r.waredDate;
        return docDate ? docDate <= filters.dateTo! : false;
      });
    }
    if (filters.search && filters.search.trim().length > 0) {
      const needle = normalizeArabicText(filters.search);
      results = results.filter((r) => {
        const haystack = normalizeArabicText(
          [
            r.subject,
            r.summary,
            r.entityName,
            r.folderName,
            r.documentType,
            r.saderNumber || "",
            r.waredNumber || "",
            r.externalSaderNumber || "",
            r.legacyNotes || "",
            r.fullText || "",
          ].join(" ")
        );
        return haystack.includes(needle);
      });
    }
  }

  if (!hasFilters) {
    documentsCache = { expiresAt: Date.now() + DOCS_CACHE_TTL_MS, docs: results };
  }

  return results;
}

/**
 * Real-time Cloud Firestore subscription (`onSnapshot`) so newly archived documents
 * and legacy sync updates appear automatically without page refresh.
 */
export function subscribeToArchiveDocuments(
  onData: (docs: ArchiveDocument[]) => void,
  onError?: (err: Error) => void,
  maxResults = 200
): () => void {
  // Emit cached docs synchronously for instant 0ms paint
  const cached = getCachedArchiveDocuments();
  if (cached) {
    onData(cached.slice(0, maxResults));
  }

  const db = getFirebaseDb();
  const q = query(
    collection(db, "documents"),
    orderBy("createdAt", "desc"),
    limit(maxResults)
  );

  return onSnapshot(
    q,
    (snap) => {
      const docs: ArchiveDocument[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<ArchiveDocument, "id">),
      }));
      documentsCache = { expiresAt: Date.now() + DOCS_CACHE_TTL_MS, docs };
      onData(docs);
    },
    (err) => {
      if (onError) onError(err);
    }
  );
}

// Remember if Firebase Storage is unavailable so we never wait 5s more than once
let firebaseStorageUnavailable =
  process.env.NEXT_PUBLIC_STORAGE_MODE === "local";

export async function uploadPdfAndCreateDocument(
  file: File,
  payload: Omit<NewArchiveDocumentInput, "storagePath" | "pdfUrl" | "originalFilename">,
  idToken?: string
): Promise<string> {
  const db = getFirebaseDb();
  const docRef = doc(collection(db, "documents"));
  const docId = docRef.id;
  const year = new Date().getFullYear();
  const safeName = sanitizeFilename(file.name);
  let storagePath = `archive/${year}/${payload.direction}/${docId}_${safeName}`;
  let pdfUrl = "";

  const uploadLocal = async () => {
    if (!idToken) throw new Error("تعذر التحقق من الجلسة لرفع الملف.");
    const formData = new FormData();
    formData.append("file", file);
    formData.append("docId", docId);
    const localRes = await fetch("/api/local-upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      body: formData,
    });
    if (!localRes.ok) {
      throw new Error("تعذر حفظ ملف الـ PDF محلياً.");
    }
    const localJson = (await localRes.json()) as {
      storagePath: string;
      pdfUrl: string;
    };
    storagePath = localJson.storagePath;
    pdfUrl = localJson.pdfUrl;
  };

  if (firebaseStorageUnavailable) {
    await uploadLocal();
  } else {
    try {
      const storage = getFirebaseStorage();
      const storageRef = ref(storage, storagePath);
      const uploadPromise = (async () => {
        await uploadBytes(storageRef, file, {
          contentType: "application/pdf",
          cacheControl: "public, max-age=31536000, immutable",
          customMetadata: { docId, direction: payload.direction },
        });
        return getDownloadURL(storageRef);
      })();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("STORAGE_TIMEOUT")), 3500)
      );

      pdfUrl = await Promise.race([uploadPromise, timeoutPromise]);
    } catch {
      firebaseStorageUnavailable = true;
      await uploadLocal();
    }
  }

  const batch = writeBatch(db);

  batch.set(docRef, {
    ...payload,
    storagePath,
    pdfUrl,
    originalFilename: file.name,
    syncedToLegacy: false,
    legacyId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Upsert Folder, Entity, and Document Type counts atomically
  // Note: Use updatedAt (not createdAt) on merge writes so existing docs preserve immutable createdAt
  if (payload.folderName.trim()) {
    const folderRef = doc(db, "folders", slugifyTaxonomyId(payload.folderName));
    batch.set(
      folderRef,
      {
        name: payload.folderName.trim(),
        documentCount: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  if (payload.entityName.trim()) {
    const entityRef = doc(db, "entities", slugifyTaxonomyId(payload.entityName));
    batch.set(
      entityRef,
      {
        name: payload.entityName.trim(),
        documentCount: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  if (payload.documentType.trim()) {
    const typeRef = doc(db, "document_types", slugifyTaxonomyId(payload.documentType));
    batch.set(
      typeRef,
      {
        name: payload.documentType.trim(),
        documentCount: increment(1),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  // Commit to Firestore (with local persistence, resolves immediately or within 3s)
  await Promise.race([
    batch.commit(),
    new Promise<void>((resolve) => setTimeout(resolve, 3000)),
  ]);
  invalidateTaxonomyCache();
  invalidateDocumentsCache();
  return docId;
}

// 5-minute client-side cache for taxonomy collections (cuts Firestore reads by ~95%)
const TAXONOMY_TTL_MS = 5 * 60 * 1000;
let taxonomyCache: {
  expiresAt: number;
  data: {
    folders: FolderItem[];
    entities: EntityItem[];
    documentTypes: DocumentTypeItem[];
  };
} | null = null;

export function invalidateTaxonomyCache(): void {
  taxonomyCache = null;
}

export async function fetchTaxonomy(forceRefresh = false): Promise<{
  folders: FolderItem[];
  entities: EntityItem[];
  documentTypes: DocumentTypeItem[];
}> {
  if (!forceRefresh && taxonomyCache && Date.now() < taxonomyCache.expiresAt) {
    return taxonomyCache.data;
  }

  const db = getFirebaseDb();
  const [foldersSnap, entitiesSnap, typesSnap] = await Promise.all([
    getDocs(query(collection(db, "folders"), orderBy("name", "asc"), limit(150))),
    getDocs(query(collection(db, "entities"), orderBy("name", "asc"), limit(200))),
    getDocs(query(collection(db, "document_types"), orderBy("name", "asc"), limit(50))),
  ]);

  const folders: FolderItem[] = foldersSnap.docs.map((d) => ({
    id: d.id,
    name: String(d.data().name || ""),
    description: String(d.data().description || ""),
    documentCount: Number(d.data().documentCount || 0),
    createdAt: d.data().createdAt || null,
  }));

  const entities: EntityItem[] = entitiesSnap.docs.map((d) => ({
    id: d.id,
    name: String(d.data().name || ""),
    category: String(d.data().category || ""),
    documentCount: Number(d.data().documentCount || 0),
    createdAt: d.data().createdAt || null,
  }));

  let documentTypes: DocumentTypeItem[] = typesSnap.docs.map((d) => ({
    id: d.id,
    name: String(d.data().name || ""),
    isDefault: Boolean(d.data().isDefault),
    documentCount: Number(d.data().documentCount || 0),
  }));

  if (documentTypes.length === 0) {
    documentTypes = DEFAULT_DOCUMENT_TYPES.map((name) => ({
      id: slugifyTaxonomyId(name),
      name,
      isDefault: true,
      documentCount: 0,
    }));
  }

  const result = { folders, entities, documentTypes };
  taxonomyCache = { expiresAt: Date.now() + TAXONOMY_TTL_MS, data: result };
  return result;
}

export async function upsertFolder(name: string, description = ""): Promise<void> {
  const db = getFirebaseDb();
  const trimmed = name.trim();
  if (!trimmed) return;
  await setDoc(
    doc(db, "folders", slugifyTaxonomyId(trimmed)),
    {
      name: trimmed,
      description: description.trim(),
      documentCount: increment(0),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  invalidateTaxonomyCache();
}

export async function upsertEntity(name: string, category = ""): Promise<void> {
  const db = getFirebaseDb();
  const trimmed = name.trim();
  if (!trimmed) return;
  await setDoc(
    doc(db, "entities", slugifyTaxonomyId(trimmed)),
    {
      name: trimmed,
      category: category.trim(),
      documentCount: increment(0),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  invalidateTaxonomyCache();
}

export async function upsertDocumentType(name: string): Promise<void> {
  const db = getFirebaseDb();
  const trimmed = name.trim();
  if (!trimmed) return;
  await setDoc(
    doc(db, "document_types", slugifyTaxonomyId(trimmed)),
    {
      name: trimmed,
      isDefault: false,
      documentCount: increment(0),
    },
    { merge: true }
  );
  invalidateTaxonomyCache();
}

/**
 * Updates editable metadata fields of an archived document (Zero-Deletion safe).
 * Recomputes normalized searchKeywords and refreshes local caches automatically.
 */
export async function updateArchiveDocument(
  docId: string,
  existing: ArchiveDocument,
  patch: Partial<
    Pick<
      ArchiveDocument,
      | "saderNumber"
      | "saderDate"
      | "waredNumber"
      | "waredDate"
      | "externalSaderNumber"
      | "externalSaderDate"
      | "subject"
      | "summary"
      | "entityName"
      | "documentType"
      | "folderName"
      | "legacyNotes"
      | "actionStatus"
      | "confidentiality"
    >
  >
): Promise<ArchiveDocument> {
  const db = getFirebaseDb();
  const merged: ArchiveDocument = {
    ...existing,
    ...patch,
  };

  const derivedSubject =
    (patch.subject ?? merged.subject).trim() ||
    merged.summary.split("\n").find((l) => l.trim())?.slice(0, 140) ||
    "مستند مؤرشف";

  const searchKeywords = buildSearchKeywords({
    subject: derivedSubject,
    summary: merged.summary,
    entityName: merged.entityName,
    documentType: merged.documentType,
    folderName: merged.folderName,
    saderNumber: merged.saderNumber,
    saderDate: merged.saderDate,
    waredNumber: merged.waredNumber,
    waredDate: merged.waredDate,
    externalSaderNumber: merged.externalSaderNumber,
    externalSaderDate: merged.externalSaderDate,
    legacyNotes: merged.legacyNotes,
    fullText: merged.fullText,
  });

  const updatePayload: Record<string, unknown> = {
    ...patch,
    subject: derivedSubject,
    searchKeywords,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, "documents", docId), updatePayload);
  invalidateDocumentsCache();
  return { ...merged, subject: derivedSubject, searchKeywords };
}

/**
 * Checks for duplicate reference numbers (saderNumber / waredNumber / externalSaderNumber)
 * using the in-memory cache first (0 Firestore reads), falling back to a small indexed query.
 */
export async function findDuplicateDocument(params: {
  direction: "sader" | "wared";
  saderNumber?: string;
  waredNumber?: string;
  externalSaderNumber?: string;
}): Promise<ArchiveDocument | null> {
  const sader = toAsciiDigits(params.saderNumber || "").trim();
  const wared = toAsciiDigits(params.waredNumber || "").trim();
  const ext = toAsciiDigits(params.externalSaderNumber || "").trim();

  if (!sader && !wared && !ext) return null;

  const cached = getCachedArchiveDocuments();
  const matchInList = (list: ArchiveDocument[]) =>
    list.find((d) => {
      if (params.direction === "sader" && sader && d.saderNumber === sader) return true;
      if (params.direction === "wared" && wared && d.waredNumber === wared) return true;
      if (params.direction === "wared" && ext && d.externalSaderNumber === ext) return true;
      return false;
    }) || null;

  if (cached) {
    return matchInList(cached);
  }

  try {
    const recent = await fetchArchiveDocuments({}, 80);
    return matchInList(recent);
  } catch {
    return null;
  }
}

/**
 * Fetches all-time archive records (up to 1,500) specifically when user clicks "تصدير الكل".
 */
export async function fetchAllDocumentsForExport(): Promise<ArchiveDocument[]> {
  const db = getFirebaseDb();
  const q = query(collection(db, "documents"), orderBy("createdAt", "desc"), limit(1500));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ArchiveDocument, "id">),
  }));
}

/**
 * Links two archived documents into the same Correspondence Thread (ربط المراسلات والردود).
 * Both documents receive the shared `threadId` so opening either shows the full timeline.
 */
export async function linkDocumentsInThread(
  sourceDoc: ArchiveDocument,
  targetDoc: ArchiveDocument
): Promise<string> {
  const db = getFirebaseDb();
  const threadId = targetDoc.threadId || sourceDoc.threadId || targetDoc.id;

  const batch = writeBatch(db);
  batch.update(doc(db, "documents", sourceDoc.id), {
    relatedDocId: targetDoc.id,
    threadId,
    updatedAt: serverTimestamp(),
  });

  const targetUpdates: Record<string, unknown> = {
    threadId,
    updatedAt: serverTimestamp(),
  };
  // Automatically mark a pending incoming letter as "replied" when an outgoing reply is linked
  if (
    sourceDoc.direction === "wared" &&
    targetDoc.direction === "sader" &&
    targetDoc.actionStatus === "pending_action"
  ) {
    targetUpdates.actionStatus = "replied";
  }

  batch.update(doc(db, "documents", targetDoc.id), targetUpdates);
  await batch.commit();
  invalidateDocumentsCache();
  return threadId;
}

/**
 * Removes a document from its linked thread without deleting any document.
 */
export async function unlinkDocumentFromThread(docId: string): Promise<void> {
  const db = getFirebaseDb();
  await updateDoc(doc(db, "documents", docId), {
    relatedDocId: null,
    threadId: null,
    updatedAt: serverTimestamp(),
  });
  invalidateDocumentsCache();
}

/**
 * Resolves all documents in the same correspondence thread (uses local cache first = 0 reads).
 */
export async function fetchThreadDocuments(
  currentDoc: ArchiveDocument
): Promise<ArchiveDocument[]> {
  const tid = currentDoc.threadId;
  if (!tid) return [];

  const cached = getCachedArchiveDocuments();
  if (cached) {
    const matches = cached.filter((d) => d.threadId === tid);
    if (matches.length > 0) {
      return matches.sort((a, b) => {
        const da = (a.direction === "sader" ? a.saderDate : a.waredDate) || "";
        const dbDate = (b.direction === "sader" ? b.saderDate : b.waredDate) || "";
        return da.localeCompare(dbDate);
      });
    }
  }

  const db = getFirebaseDb();
  const q = query(
    collection(db, "documents"),
    where("threadId", "==", tid),
    limit(30)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ArchiveDocument, "id">) }))
    .sort((a, b) => {
      const da = (a.direction === "sader" ? a.saderDate : a.waredDate) || "";
      const dbDate = (b.direction === "sader" ? b.saderDate : b.waredDate) || "";
      return da.localeCompare(dbDate);
    });
}

