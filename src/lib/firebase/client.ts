import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

// Public Firebase Web App config (safe to bundle in client JS; security is enforced by Firestore Rules & Auth)
export const PUBLIC_FIREBASE_API_KEY =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
  "AIzaSyC3Lt0xKAwasvKR8jfKgAjZUNm-jq2palo";

const firebaseConfig = {
  apiKey: PUBLIC_FIREBASE_API_KEY,
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "archrive-5798a.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "archrive-5798a",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "archrive-5798a.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "306846062744",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:306846062744:web:8a7f5e2ffe734b1e38d8ed",
};

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

let cachedApp: FirebaseApp | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;
let cachedStorage: FirebaseStorage | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (cachedApp) return cachedApp;
  cachedApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return cachedApp;
}

export function getFirebaseAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  cachedAuth = getAuth(getFirebaseApp());
  return cachedAuth;
}

/**
 * Initializes Cloud Firestore with persistent IndexedDB local cache (multi-tab).
 * Dramatically reduces Firestore read counts to stay comfortably inside the Spark Free Tier.
 */
export function getFirebaseDb(): Firestore {
  if (cachedDb) return cachedDb;
  const app = getFirebaseApp();
  if (typeof window !== "undefined") {
    try {
      cachedDb = initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
      return cachedDb;
    } catch {
      // Already initialized (e.g., Fast Refresh)
    }
  }
  cachedDb = getFirestore(app);
  return cachedDb;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (cachedStorage) return cachedStorage;
  cachedStorage = getStorage(getFirebaseApp());
  // Prevent 10-minute default hang when Storage is not enabled on Firebase Spark Free Tier
  cachedStorage.maxUploadRetryTime = 5000;
  cachedStorage.maxOperationRetryTime = 5000;
  return cachedStorage;
}
