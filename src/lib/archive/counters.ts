import { doc, getDoc, runTransaction } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { CorrespondenceDirection } from "@/lib/types";

function formatSerial(year: number, seq: number): string {
  return `${year}/${String(seq).padStart(5, "0")}`;
}

/**
 * Non-mutating preview of the next serial number for a direction and year (e.g. 2026/00001).
 */
export async function peekNextSerialNumber(
  direction: CorrespondenceDirection,
  year: number = new Date().getFullYear()
): Promise<string> {
  const db = getFirebaseDb();
  const counterId = `${direction}_${year}`;
  const ref = doc(db, "counters", counterId);
  const snap = await getDoc(ref);
  const current = snap.exists() ? Number(snap.data().current || 0) : 0;
  return formatSerial(year, current + 1);
}

/**
 * Atomically increments and reserves the next yearly serial number via Firestore transaction.
 */
export async function reserveNextSerialNumber(
  direction: CorrespondenceDirection,
  year: number = new Date().getFullYear()
): Promise<string> {
  const db = getFirebaseDb();
  const counterId = `${direction}_${year}`;
  const ref = doc(db, "counters", counterId);

  const nextSeq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists() ? Number(snap.data().current || 0) : 0;
    const next = current + 1;
    tx.set(
      ref,
      {
        current: next,
        year,
        direction,
      },
      { merge: true }
    );
    return next;
  });

  return formatSerial(year, nextSeq);
}

