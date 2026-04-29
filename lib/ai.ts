import OpenAI from "openai";
import { SUPPORTS_TRANSPARENT, type ImageModel } from "./types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GenerateOptions {
  size?: string;
  model?: ImageModel;
  transparent?: boolean;
}

export async function generateProjectImage(
  prompt: string,
  { size = "1024x1024", model = "gpt-image-2", transparent = false }: GenerateOptions = {}
): Promise<{ base64: string }> {
  const useTransparent = transparent && SUPPORTS_TRANSPARENT[model];
  const response = await openai.images.generate({
    model,
    prompt,
    size,
    quality: "high",
    output_format: "png",
    ...(useTransparent ? { background: "transparent" } : {}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  const base64 = response.data?.[0]?.b64_json;
  if (!base64) throw new Error("No image data in OpenAI response");
  return { base64 };
}

export async function editProjectImage(
  imageBase64: string,
  editPrompt: string,
  { size = "1024x1024", model = "gpt-image-2", transparent = false }: GenerateOptions = {}
): Promise<{ base64: string }> {
  const imageBuffer = Buffer.from(imageBase64, "base64");
  const imageFile = new File([imageBuffer], "image.png", { type: "image/png" });

  const useTransparent = transparent && SUPPORTS_TRANSPARENT[model];
  const response = await openai.images.edit({
    model,
    image: imageFile,
    prompt: editPrompt,
    size,
    quality: "high",
    output_format: "png",
    ...(useTransparent ? { background: "transparent" } : {}),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const base64 = response.data?.[0]?.b64_json;
  if (!base64) throw new Error("No image data in OpenAI edit response");
  return { base64 };
}
