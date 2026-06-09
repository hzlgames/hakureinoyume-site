import { mkdir, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { auditAdminAction, requireAdmin } from "../../../lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backgroundDirectory = path.join(process.cwd(), "public", "backgrounds");
const backgroundFile = path.join(backgroundDirectory, "admin-background.webp");
const publicBackgroundPath = "/backgrounds/admin-background.webp";
const maxImageBytes = 3 * 1024 * 1024;

async function getCustomBackground() {
  try {
    const fileStat = await stat(backgroundFile);
    const version = Math.floor(fileStat.mtimeMs);

    return {
      src: `${publicBackgroundPath}?v=${version}`,
      updatedAt: new Date(fileStat.mtimeMs).toISOString()
    };
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json({ custom: await getCustomBackground() });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return admin.response;
  }

  const body = (await request.json().catch(() => null)) as {
    imageData?: unknown;
  } | null;

  if (typeof body?.imageData !== "string") {
    return NextResponse.json({ error: "missing_image" }, { status: 400 });
  }

  const match = body.imageData.match(/^data:image\/webp;base64,([a-zA-Z0-9+/=]+)$/);

  if (!match) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const imageBuffer = Buffer.from(match[1], "base64");

  if (imageBuffer.byteLength === 0 || imageBuffer.byteLength > maxImageBytes) {
    return NextResponse.json({ error: "image_too_large" }, { status: 413 });
  }

  await mkdir(backgroundDirectory, { recursive: true });
  await writeFile(backgroundFile, imageBuffer, { mode: 0o644 });
  await auditAdminAction({
    action: "background.update",
    actorId: admin.session.user.id,
    metadata: { bytes: imageBuffer.byteLength }
  });

  return NextResponse.json({ ok: true, custom: await getCustomBackground() });
}

export async function DELETE() {
  const admin = await requireAdmin();

  if (!admin.ok) {
    return admin.response;
  }

  await unlink(backgroundFile).catch(() => undefined);
  await auditAdminAction({
    action: "background.reset",
    actorId: admin.session.user.id
  });

  return NextResponse.json({ ok: true, custom: null });
}
