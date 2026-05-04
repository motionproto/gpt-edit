import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  loadProject,
  saveProject,
  saveImage,
  readReferenceImage,
  readPromptImage,
} from "@/lib/storage";
import { generateProjectImage } from "@/lib/ai";
import {
  ImageVariant,
  VARIANT_COUNT,
  IMAGE_MODELS,
  ImageModel,
  validateSizeForModel,
} from "@/lib/types";

const VARIATION_HINTS = [
  "Focus on a slightly different angle or perspective.",
  "Vary the details subtly.",
  "Use a slightly different composition.",
];

export async function POST(request: Request) {
  try {
    const {
      variantIndex,
      prompt: bodyPrompt,
      size: bodySize,
      model: bodyModel,
      transparent: bodyTransparent,
      maskBase64,
    } = await request.json();

    const maskBuffer =
      typeof maskBase64 === "string" && maskBase64
        ? Buffer.from(maskBase64, "base64")
        : undefined;
    const project = await loadProject();

    const prompt = (typeof bodyPrompt === "string" ? bodyPrompt : project.prompt).trim();
    const model: ImageModel =
      typeof bodyModel === "string" && (IMAGE_MODELS as readonly string[]).includes(bodyModel)
        ? (bodyModel as ImageModel)
        : project.model;
    const candidateSize = typeof bodySize === "string" ? bodySize : project.size;
    const sizeCheck = validateSizeForModel(candidateSize, model);
    const size = sizeCheck.valid ? candidateSize : project.size;
    const transparent =
      typeof bodyTransparent === "boolean" ? bodyTransparent : project.transparent;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    if (typeof bodySize === "string" && !sizeCheck.valid) {
      return NextResponse.json(
        { error: `Invalid size: ${sizeCheck.reason}` },
        { status: 400 }
      );
    }

    project.prompt = prompt;
    project.size = size;
    project.model = model;
    project.transparent = transparent;

    // Pull reference image bytes once; reuse for every variant.
    // The prompt image (subject) goes first so the model treats it as primary.
    const referenceBuffers = await Promise.all(
      project.referenceImages.map((ref) => readReferenceImage(ref.id))
    );
    const promptImageBuffer = project.promptImage
      ? await readPromptImage(project.promptImage.id)
      : null;
    const references = promptImageBuffer
      ? [promptImageBuffer, ...referenceBuffers]
      : referenceBuffers;

    const targets =
      typeof variantIndex === "number"
        ? [variantIndex]
        : Array.from({ length: VARIANT_COUNT }, (_, i) => i);

    // When a mask is supplied, the output must match the mask dimensions, so
    // let the API mirror them via `auto` instead of forcing the user-selected size.
    const apiSize = maskBuffer ? "auto" : size;

    for (const i of targets) {
      const variedPrompt = `${prompt} ${VARIATION_HINTS[i % VARIATION_HINTS.length]}`;
      const { base64 } = await generateProjectImage(variedPrompt, {
        size: apiSize,
        model,
        transparent,
        references,
        mask: maskBuffer,
      });
      const filename = await saveImage(i, Buffer.from(base64, "base64"));

      const variant: ImageVariant = {
        id: randomUUID(),
        filename,
        prompt: variedPrompt,
        generatedAt: new Date().toISOString(),
      };

      while (project.images.length <= i) project.images.push(null);
      project.images[i] = variant;
    }

    await saveProject(project);
    return NextResponse.json({ project });
  } catch (error) {
    console.error("Failed to generate images:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate images" },
      { status: 500 }
    );
  }
}
