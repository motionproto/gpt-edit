import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = "gpt-image-2";

export async function generateProjectImage(
  prompt: string,
  transparent = false
): Promise<{ base64: string }> {
  const response = await openai.images.generate({
    model: MODEL,
    prompt,
    size: "1024x1024",
    quality: "high",
    output_format: "png",
    ...(transparent ? { background: "transparent" } : {}),
  });
  const base64 = response.data?.[0]?.b64_json;
  if (!base64) throw new Error("No image data in OpenAI response");
  return { base64 };
}

export async function editProjectImage(
  imageBase64: string,
  editPrompt: string,
  transparent = false
): Promise<{ base64: string }> {
  const imageBuffer = Buffer.from(imageBase64, "base64");
  const imageFile = new File([imageBuffer], "image.png", { type: "image/png" });

  const response = await openai.images.edit({
    model: MODEL,
    image: imageFile,
    prompt: editPrompt,
    size: "1024x1024",
    quality: "high",
    output_format: "png",
    ...(transparent ? { background: "transparent" } : {}),
  });

  const base64 = response.data?.[0]?.b64_json;
  if (!base64) throw new Error("No image data in OpenAI edit response");
  return { base64 };
}
