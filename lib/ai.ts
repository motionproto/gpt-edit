import OpenAI from "openai";
import { SUPPORTS_TRANSPARENT, type ImageModel } from "./types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface GenerateOptions {
  size?: string;
  model?: ImageModel;
  transparent?: boolean;
  references?: Buffer[];
}

interface EditOptions extends GenerateOptions {
  mask?: Buffer;
}

function bufferToFile(buf: Buffer, name: string): File {
  return new File([new Uint8Array(buf)], name, { type: "image/png" });
}

export async function generateProjectImage(
  prompt: string,
  {
    size = "1024x1024",
    model = "gpt-image-2",
    transparent = false,
    references = [],
  }: GenerateOptions = {}
): Promise<{ base64: string }> {
  const useTransparent = transparent && SUPPORTS_TRANSPARENT[model];

  // With reference images, we route through `images.edit` so the references guide generation.
  if (references.length > 0) {
    const refFiles = references.map((buf, i) => bufferToFile(buf, `ref-${i}.png`));
    const response = await openai.images.edit({
      model,
      image: refFiles,
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
  {
    size = "1024x1024",
    model = "gpt-image-2",
    transparent = false,
    references = [],
  }: GenerateOptions = {}
): Promise<{ base64: string }> {
  const baseFile = bufferToFile(Buffer.from(imageBase64, "base64"), "image.png");
  const refFiles = references.map((buf, i) => bufferToFile(buf, `ref-${i}.png`));

  const useTransparent = transparent && SUPPORTS_TRANSPARENT[model];
  const response = await openai.images.edit({
    model,
    image: refFiles.length > 0 ? [baseFile, ...refFiles] : baseFile,
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

// Standalone edit used by the /editor page. Accepts any source image buffer (not tied to a project slot)
// plus an optional mask buffer for region edits.
export async function editFreeformImage(
  image: Buffer,
  prompt: string,
  { size = "auto", model = "gpt-image-2", mask }: EditOptions = {}
): Promise<{ base64: string }> {
  const baseFile = bufferToFile(image, "image.png");
  const maskFile = mask ? bufferToFile(mask, "mask.png") : undefined;

  const response = await openai.images.edit({
    model,
    image: baseFile,
    prompt,
    size,
    quality: "high",
    output_format: "png",
    ...(maskFile ? { mask: maskFile } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const base64 = response.data?.[0]?.b64_json;
  if (!base64) throw new Error("No image data in OpenAI edit response");
  return { base64 };
}
