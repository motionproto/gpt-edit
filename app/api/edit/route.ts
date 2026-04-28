import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  loadProject,
  saveProject,
  readImage,
  savePreviewImage,
  acceptPreviewImage,
  discardPreviewImage,
} from "@/lib/storage";
import { editProjectImage } from "@/lib/ai";
import { ImageVariant } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { variantIndex, editPrompt, action } = await request.json();

    if (typeof variantIndex !== "number") {
      return NextResponse.json({ error: "variantIndex required" }, { status: 400 });
    }

    if (action === "accept") {
      await acceptPreviewImage(variantIndex);
      const project = await loadProject();
      const existing = project.images[variantIndex];
      const updated: ImageVariant = {
        id: randomUUID(),
        filename: existing?.filename ?? `variant-${variantIndex}.png`,
        prompt: existing?.prompt ?? "",
        generatedAt: new Date().toISOString(),
      };
      while (project.images.length <= variantIndex) project.images.push(null);
      project.images[variantIndex] = updated;
      await saveProject(project);
      return NextResponse.json({ project });
    }

    if (action === "discard") {
      await discardPreviewImage(variantIndex);
      return NextResponse.json({ success: true });
    }

    if (typeof editPrompt !== "string" || !editPrompt.trim()) {
      return NextResponse.json({ error: "editPrompt required" }, { status: 400 });
    }

    let imageBase64: string;
    try {
      imageBase64 = (await readImage(variantIndex)).toString("base64");
    } catch {
      return NextResponse.json({ error: "Original image not found" }, { status: 404 });
    }

    const project = await loadProject();
    const { base64 } = await editProjectImage(
      imageBase64,
      editPrompt.trim(),
      project.transparent
    );
    await savePreviewImage(variantIndex, Buffer.from(base64, "base64"));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to edit image:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to edit image" },
      { status: 500 }
    );
  }
}
