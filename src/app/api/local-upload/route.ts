import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { verifyRequestUser } from "@/lib/firebase/admin";
import { sanitizeFilename } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * Free-tier local PDF upload fallback (used automatically when Firebase Storage
 * is not enabled on the Spark Free Plan). Saves files append-only (never overwrites)
 * under `public/uploads/{docId}_{safeName}`.
 */
export async function POST(request: Request) {
  try {
    await verifyRequestUser(request);

    const formData = await request.formData();
    const file = formData.get("file");
    const docId = String(formData.get("docId") || "").replace(/[^a-zA-Z0-9_-]/g, "");

    if (!(file instanceof File) || !docId) {
      return NextResponse.json({ error: "Invalid file or docId" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const safeName = sanitizeFilename(file.name);
    const storedName = `${docId}_${safeName}`;
    const fullPath = path.join(uploadsDir, storedName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(fullPath, buffer);

    const origin = new URL(request.url).origin;
    return NextResponse.json({
      storagePath: `local/uploads/${storedName}`,
      pdfUrl: `${origin}/uploads/${encodeURIComponent(storedName)}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
