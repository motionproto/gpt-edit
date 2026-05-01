import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadProject, saveProject, saveReferenceImage } from "@/lib/storage";
import { MAX_REFERENCES, ReferenceImage } from "@/lib/types";

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB before base64 inflation

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
    if (project.referenceImages.length >= MAX_REFERENCES) {
      return NextResponse.json(
        { error: `At most ${MAX_REFERENCES} reference images` },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const buf = Buffer.from(await file.arrayBuffer());
    const filename = await saveReferenceImage(id, buf);
    const ref: ReferenceImage = {
      id,
      filename,
      uploadedAt: new Date().toISOString(),
    };
    project.referenceImages = [...project.referenceImages, ref];
    await saveProject(project);

    return NextResponse.json({ project, reference: ref });
  } catch (error) {
    console.error("Failed to upload reference:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 }
    );
  }
}
