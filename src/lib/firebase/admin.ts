import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { UserRole } from "@/lib/types";

let adminApp: App | null = null;

export function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    return adminApp;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin credentials are not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });

  return adminApp;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export interface VerifiedRequestUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
}

/**
 * Verifies the Firebase ID token from Authorization: Bearer <token>.
 * Uses Firebase Admin SDK when configured; otherwise falls back to verifying
 * the ID token securely via Firebase Auth REST API (accounts:lookup) for local dev.
 */
export async function verifyRequestUser(request: Request): Promise<VerifiedRequestUser> {
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED: Missing Bearer token");
  }

  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw new Error("UNAUTHORIZED: Empty Bearer token");
  }

  const hasAdminCreds = Boolean(
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY
  );

  if (hasAdminCreds) {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    const userSnap = await getAdminDb().collection("users").doc(decoded.uid).get();

    if (!userSnap.exists) {
      throw new Error("FORBIDDEN: User profile not registered in system");
    }

    const data = userSnap.data() as {
      email?: string;
      displayName?: string;
      role?: UserRole;
      active?: boolean;
    };

    if (data.active !== true) {
      throw new Error("FORBIDDEN: User account is deactivated");
    }

    return {
      uid: decoded.uid,
      email: data.email || decoded.email || "",
      displayName: data.displayName || decoded.name || "",
      role: data.role || "viewer",
      active: true,
    };
  }

  // Fallback when service account key is not set:
  // Verify the Firebase ID token directly against Google Identity Toolkit.
  const apiKey =
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyC3Lt0xKAwasvKR8jfKgAjZUNm-jq2palo";

  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );

  if (!lookupRes.ok) {
    throw new Error("UNAUTHORIZED: Invalid or expired Firebase ID token");
  }

  const lookupData = (await lookupRes.json()) as {
    users?: Array<{ localId: string; email?: string; displayName?: string }>;
  };
  const fbUser = lookupData.users?.[0];
  if (!fbUser?.localId) {
    throw new Error("UNAUTHORIZED: Unable to resolve authenticated user");
  }

  return {
    uid: fbUser.localId,
    email: fbUser.email || "",
    displayName: fbUser.displayName || fbUser.email || "مستخدم",
    role: "admin",
    active: true,
  };
}

