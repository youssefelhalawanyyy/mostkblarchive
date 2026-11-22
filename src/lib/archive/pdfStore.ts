import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";

// ~550 KB raw bytes -> ~735 KB base64 string (comfortably under Firestore's 1 MB doc limit)
const RAW_CHUNK_BYTES = 550 * 1024;
const MAX_CHUNKS = 20; // Up to ~11 MB PDFs

const blobUrlCache = new Map<string, string>();

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function isFirestoreChunkPdf(storagePath?: string | null): boolean {
  return Boolean(storagePath && storagePath.startsWith("firestore/pdf_chunks/"));
}

/**
 * Stores a PDF file directly in Cloud Firestore chunks (`pdf_chunks/{docId}/parts/{i}`).
 * Works 100% FREE on Vercel Hobby + Firebase Spark (no Blaze Storage or writable disk needed).
 */
export async function savePdfToFirestoreChunks(
  docId: string,
  file: File
): Promise<{ storagePath: string; pdfUrl: string }> {
  const db = getFirebaseDb();
  const buffer = new Uint8Array(await file.arrayBuffer());
  const totalChunks = Math.max(1, Math.ceil(buffer.length / RAW_CHUNK_BYTES));

  if (totalChunks > MAX_CHUNKS) {
    throw new Error(
      "حجم ملف الـ PDF كبير جداً للتخزين السحابي المجاني (الحد الأقصى 10 ميجابايت)."
    );
  }

  const writes: Promise<void>[] = [];
  for (let i = 0; i < totalChunks; i++) {
    const slice = buffer.subarray(i * RAW_CHUNK_BYTES, (i + 1) * RAW_CHUNK_BYTES);
    const b64 = uint8ToBase64(slice);
    const partRef = doc(db, "pdf_chunks", docId, "parts", String(i).padStart(3, "0"));
    writes.push(
      setDoc(partRef, {
        data: b64,
        index: i,
        total: totalChunks,
        filename: file.name || "document.pdf",
        createdAt: serverTimestamp(),
      })
    );
  }

  await Promise.all(writes);

  // Also pre-warm the local blob URL cache so opening the doc immediately costs 0 reads
  const blobUrl = URL.createObjectURL(file);
  blobUrlCache.set(docId, blobUrl);

  return {
    storagePath: `firestore/pdf_chunks/${docId}`,
    pdfUrl: `https://archrive-5798a.firebaseapp.com/pdf-store/${docId}`,
  };
}

/**
 * Loads a chunked PDF from Firestore (served from IndexedDB cache on repeat views = 0 reads)
 * and returns a local `blob:` URL ready for iframe preview, Print PDF, and Download.
 */
export async function loadPdfFromFirestoreChunks(docId: string): Promise<string> {
  const existing = blobUrlCache.get(docId);
  if (existing) return existing;

  const db = getFirebaseDb();
  const q = query(
    collection(db, "pdf_chunks", docId, "parts"),
    orderBy("index", "asc")
  );
  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error("ملف الـ PDF غير موجود في التخزين.");
  }

  const arrays: Uint8Array[] = [];
  let totalLen = 0;
  for (const d of snap.docs) {
    const b64 = String(d.data().data || "");
    const bytes = base64ToUint8(b64);
    arrays.push(bytes);
    totalLen += bytes.length;
  }

  const merged = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    merged.set(arr, offset);
    offset += arr.length;
  }

  const blob = new Blob([merged], { type: "application/pdf" });
  const blobUrl = URL.createObjectURL(blob);
  blobUrlCache.set(docId, blobUrl);
  return blobUrl;
}
