import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { loadProject, saveProject, saveImage } from "@/lib/storage";
import { generateProjectImage } from "@/lib/ai";
import { ImageVariant, VARIANT_COUNT } from "@/lib/types";

const VARIATION_HINTS = [
  "Focus on a slightly different angle or perspective.",
  "Vary the details subtly.",
  "Use a slightly different composition.",
];

export async function POST(request: Request) {
  try {
    const { variantIndex, prompt: bodyPrompt, transparent: bodyTransparent } = await request.json();
    const project = await loadProject();

    const prompt = (typeof bodyPrompt === "string" ? bodyPrompt : project.prompt).trim();
    const transparent =
      typeof bodyTransparent === "boolean" ? bodyTransparent : project.transparent;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    project.prompt = prompt;
    project.transparent = transparent;

    const targets =
      typeof variantIndex === "number"
        ? [variantIndex]
        : Array.from({ length: VARIANT_COUNT }, (_, i) => i);

    for (const i of targets) {
      const variedPrompt = `${prompt} ${VARIATION_HINTS[i % VARIATION_HINTS.length]}`;
      const { base64 } = await generateProjectImage(variedPrompt, transparent);
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
