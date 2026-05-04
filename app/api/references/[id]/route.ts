import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  deleteReferenceImage,
  loadProject,
  saveProject,
  saveReferenceImage,
} from "@/lib/storage";
import { ReferenceImage } from "@/lib/types";
import { readImageDimensions } from "@/lib/image-dims";

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024;

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await loadProject();
    const next = project.referenceImages.filter((r) => r.id !== id);
    if (next.length === project.referenceImages.length) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }
    project.referenceImages = next;
    await saveProject(project);
    await deleteReferenceImage(id);
    return NextResponse.json({ project });
  } catch (error) {
    console.error("Failed to delete reference:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    if (!ACCEPTED.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported type ${file.type}; use PNG/JPEG/WebP` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    const project = await loadProject();
    const idx = project.referenceImages.findIndex((r) => r.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }

    await deleteReferenceImage(id);
    const newId = randomUUID();
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = await saveReferenceImage(newId, buf);
    let width: number | undefined;
    let height: number | undefined;
    try {
      const dims = readImageDimensions(buf);
      width = dims.w;
      height = dims.h;
    } catch (e) {
      console.warn("Could not read reference image dimensions:", e);
    }
    const replaced: ReferenceImage = {
      id: newId,
      filename,
      uploadedAt: new Date().toISOString(),
      width,
      height,
    };
    project.referenceImages = [
      ...project.referenceImages.slice(0, idx),
      replaced,
      ...project.referenceImages.slice(idx + 1),
    ];
    await saveProject(project);
    return NextResponse.json({ project, reference: replaced });
  } catch (error) {
    console.error("Failed to replace reference:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Replace failed" },
      { status: 500 }
    );
  }
}
