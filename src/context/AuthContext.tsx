"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseDb,
  isFirebaseConfigured,
} from "@/lib/firebase/client";
import type { UserProfile } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  profile: null,
  loading: true,
  configured: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  getIdToken: async () => "",
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isFirebaseConfigured();

  useEffect(() => {
    if (!configured) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    let unsubProfile: (() => void) | null = null;
    let settled = false;

    // Never allow the loading screen to hang if Firebase Auth/Network is slow
    const safetyTimer = setTimeout(() => {
      if (!settled) setLoading(false);
    }, 3500);

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      settled = true;
      clearTimeout(safetyTimer);
      setUser(firebaseUser);

      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      // Immediately unblock the UI with the authenticated user's fallback profile
      const fallbackProfile: UserProfile = {
        uid: firebaseUser.uid,
        email: firebaseUser.email || "",
        displayName:
          firebaseUser.displayName || firebaseUser.email?.split("@")[0] || "مدير النظام",
        role: "admin",
        active: true,
      };
      setProfile((prev) => prev ?? fallbackProfile);
      setLoading(false);

      // Sync with Firestore users/{uid} in the background without blocking UI render
      const userDocRef = doc(db, "users", firebaseUser.uid);
      unsubProfile = onSnapshot(
        userDocRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            setProfile({
              uid: firebaseUser.uid,
              email: String(data.email || firebaseUser.email || ""),
              displayName: String(
                data.displayName || firebaseUser.displayName || firebaseUser.email || "مستخدم"
              ),
              role: data.role || "editor",
              active: data.active !== false,
              createdAt: data.createdAt || null,
            });
          } else {
            // Fire-and-forget auto-provisioning (never blocks loading state)
            setDoc(userDocRef, {
              ...fallbackProfile,
              createdAt: serverTimestamp(),
            }).catch(() => {});
          }
        },
        () => {
          // Keep fallback profile active if Firestore is offline or rules restrict reads
        }
      );
    });

    return () => {
      clearTimeout(safetyTimer);
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, [configured]);

  const signIn = async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    setDoc(doc(db, "users", cred.user.uid), {
      uid: cred.user.uid,
      email: cred.user.email || email,
      displayName: displayName.trim() || email,
      role: "admin",
      active: true,
      createdAt: serverTimestamp(),
    }).catch(() => {});
  };

  const signOut = async () => {
    const auth = getFirebaseAuth();
    await firebaseSignOut(auth);
  };

  const getIdToken = async () => {
    if (!user) return "";
    return user.getIdToken();
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, configured, signIn, signUp, signOut, getIdToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
