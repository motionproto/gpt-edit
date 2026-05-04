import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  deletePromptMask,
  loadProject,
  savePromptMask,
  saveProject,
} from "@/lib/storage";
import { ReferenceImage } from "@/lib/types";

const ACCEPTED = new Set(["image/png"]);
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const project = await loadProject();
    if (!project.promptImage) {
      return NextResponse.json(
        { error: "No prompt image to mask" },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    if (!ACCEPTED.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported type ${file.type}; mask must be PNG` },
        { status: 400 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
        { status: 400 }
      );
    }

    if (project.promptMask) await deletePromptMask(project.promptMask.id);

    const id = randomUUID();
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = await savePromptMask(id, buf);
    const promptMask: ReferenceImage = {
      id,
      filename,
      uploadedAt: new Date().toISOString(),
    };
    project.promptMask = promptMask;
    await saveProject(project);

    return NextResponse.json({ project, promptMask });
  } catch (error) {
    console.error("Failed to upload prompt mask:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const project = await loadProject();
    if (project.promptMask) {
      await deletePromptMask(project.promptMask.id);
      project.promptMask = null;
      await saveProject(project);
    }
    return NextResponse.json({ project });
  } catch (error) {
    console.error("Failed to delete prompt mask:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
