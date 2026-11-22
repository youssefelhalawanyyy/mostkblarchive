import { NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb, verifyRequestUser } from "@/lib/firebase/admin";

export const runtime = "nodejs";

const CreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().min(2).max(120),
  role: z.enum(["admin", "editor", "viewer"]),
});

const UpdateUserSchema = z.object({
  uid: z.string().min(1),
  role: z.enum(["admin", "editor", "viewer"]).optional(),
  active: z.boolean().optional(),
  displayName: z.string().min(2).max(120).optional(),
});

async function requireAdmin(request: Request) {
  const user = await verifyRequestUser(request);
  if (user.role !== "admin") {
    throw new Error("FORBIDDEN: Admin privileges required");
  }
  return user;
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const snap = await getAdminDb()
      .collection("users")
      .orderBy("createdAt", "desc")
      .get();

    const users = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        email: String(data.email || ""),
        displayName: String(data.displayName || ""),
        role: data.role || "viewer",
        active: data.active !== false,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
      };
    });

    return NextResponse.json({ users });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    const status = msg.startsWith("FORBIDDEN") ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const body = await request.json();
    const parsed = CreateUserSchema.parse(body);

    const authRecord = await getAdminAuth().createUser({
      email: parsed.email,
      password: parsed.password,
      displayName: parsed.displayName,
    });

    await getAdminDb().collection("users").doc(authRecord.uid).set({
      uid: authRecord.uid,
      email: parsed.email,
      displayName: parsed.displayName,
      role: parsed.role,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json(
      {
        user: {
          uid: authRecord.uid,
          email: parsed.email,
          displayName: parsed.displayName,
          role: parsed.role,
          active: true,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to create user";
    const status = msg.startsWith("FORBIDDEN")
      ? 403
      : msg.startsWith("UNAUTHORIZED")
      ? 401
      : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(request: Request) {
  try {
    const adminUser = await requireAdmin(request);
    const body = await request.json();
    const parsed = UpdateUserSchema.parse(body);

    if (parsed.uid === adminUser.uid && parsed.active === false) {
      return NextResponse.json(
        { error: "لا يمكنك تعطيل حساب مدير النظام الحالي." },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.role !== undefined) updates.role = parsed.role;
    if (parsed.active !== undefined) updates.active = parsed.active;
    if (parsed.displayName !== undefined) updates.displayName = parsed.displayName;

    await getAdminDb().collection("users").doc(parsed.uid).update(updates);

    if (parsed.active !== undefined) {
      await getAdminAuth().updateUser(parsed.uid, { disabled: !parsed.active });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update user";
    const status = msg.startsWith("FORBIDDEN")
      ? 403
      : msg.startsWith("UNAUTHORIZED")
      ? 401
      : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

