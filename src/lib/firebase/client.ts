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

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
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
