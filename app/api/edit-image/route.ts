import { NextResponse } from "next/server";
import { editFreeformImage } from "@/lib/ai";
import {
  IMAGE_MODELS,
  ImageModel,
  validateSizeForModel,
} from "@/lib/types";

const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const image = form.get("image");
    const mask = form.get("mask");
    const prompt = form.get("prompt");
    const sizeRaw = form.get("size");
    const modelRaw = form.get("model");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "image required" }, { status: 400 });
    }
    if (!ACCEPTED.has(image.type)) {
      return NextResponse.json(
        { error: `Unsupported image type ${image.type}` },
        { status: 400 }
      );
    }
    if (image.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 400 });
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    const model: ImageModel =
      typeof modelRaw === "string" && (IMAGE_MODELS as readonly string[]).includes(modelRaw)
        ? (modelRaw as ImageModel)
        : "gpt-image-2";
    const size = typeof sizeRaw === "string" ? sizeRaw : "auto";
    const sizeCheck = validateSizeForModel(size, model);
    if (!sizeCheck.valid) {
      return NextResponse.json(
        { error: `Invalid size: ${sizeCheck.reason}` },
        { status: 400 }
      );
    }

    const imageBuf = Buffer.from(await image.arrayBuffer());
    let maskBuf: Buffer | undefined;
    if (mask instanceof File) {
      if (mask.size > MAX_BYTES) {
        return NextResponse.json({ error: "Mask too large" }, { status: 400 });
      }
      maskBuf = Buffer.from(await mask.arrayBuffer());
    }

    const { base64 } = await editFreeformImage(imageBuf, prompt.trim(), {
      size,
      model,
      mask: maskBuf,
    });

    return NextResponse.json({ b64: base64 });
  } catch (error) {
    console.error("Failed to edit image:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Edit failed" },
      { status: 500 }
    );
  }
}
