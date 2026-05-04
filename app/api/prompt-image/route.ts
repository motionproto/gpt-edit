import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  deletePromptImage,
  deletePromptMask,
  loadProject,
  savePromptImage,
  saveProject,
} from "@/lib/storage";
import { ReferenceImage } from "@/lib/types";
import { readImageDimensions } from "@/lib/image-dims";

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
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
    if (project.promptImage) await deletePromptImage(project.promptImage.id);
    // A saved custom mask is tied to the prior prompt image; invalidate on replace.
    if (project.promptMask) {
      await deletePromptMask(project.promptMask.id);
      project.promptMask = null;
    }

    const id = randomUUID();
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = await savePromptImage(id, buf);
    let width: number | undefined;
    let height: number | undefined;
    try {
      const dims = readImageDimensions(buf);
      width = dims.w;
      height = dims.h;
    } catch (e) {
      console.warn("Could not read prompt image dimensions:", e);
    }
    const promptImage: ReferenceImage = {
      id,
      filename,
      uploadedAt: new Date().toISOString(),
      width,
      height,
    };
    project.promptImage = promptImage;
    await saveProject(project);

    return NextResponse.json({ project, promptImage });
  } catch (error) {
    console.error("Failed to upload prompt image:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const project = await loadProject();
    if (project.promptImage) {
      await deletePromptImage(project.promptImage.id);
      project.promptImage = null;
    }
    if (project.promptMask) {
      await deletePromptMask(project.promptMask.id);
      project.promptMask = null;
    }
    await saveProject(project);
    return NextResponse.json({ project });
  } catch (error) {
    console.error("Failed to delete prompt image:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
