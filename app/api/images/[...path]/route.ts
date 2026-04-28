import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

const IMAGES_DIR = path.join(process.cwd(), "data", "images");

function resolveImagePath(segments: string[]): string {
  const filename = segments.join("/");
  const resolved = path.join(IMAGES_DIR, filename);
  if (!resolved.startsWith(IMAGES_DIR)) {
    throw new Error("Invalid path");
  }
  return resolved;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params;
    const buffer = await fs.readFile(resolveImagePath(segments));
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}

export async function HEAD(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: segments } = await params;
    await fs.access(resolveImagePath(segments));
    return new NextResponse(null, { status: 200 });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
