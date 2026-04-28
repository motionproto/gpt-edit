import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, generateImage } from "ai";
import OpenAI from "openai";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function generateProjectImage(
  prompt: string,
  modelId: string
): Promise<{ base64: string }> {
  if (modelId === "openai-gpt-image-1.5") {
    const response = await openai.images.generate({
      model: "gpt-image-1.5",
      prompt,
      size: "1024x1024",
      quality: "high",
      output_format: "png",
    });
    const base64 = response.data?.[0]?.b64_json;
    if (!base64) throw new Error("No image data in OpenAI response");
    return { base64 };
  }

  if (modelId === "google-imagen-4") {
    const { image } = await generateImage({
      model: google.image("imagen-4.0-generate-001"),
      prompt,
      aspectRatio: "1:1",
    });
    return { base64: image.base64 };
  }

  if (modelId === "gemini-2.5-flash") {
    const { files } = await generateText({
      model: google("gemini-2.5-flash-image-preview"),
      providerOptions: {
        google: { responseModalities: ["IMAGE"] },
      },
      prompt,
    });
    const imageFile = files?.find((f) => f.mediaType?.startsWith("image/"));
    if (!imageFile) throw new Error("No image in Gemini response");
    return { base64: imageFile.base64 };
  }

  throw new Error(`Unknown model: ${modelId}`);
}

export async function editProjectImage(
  imageBase64: string,
  editPrompt: string
): Promise<{ base64: string }> {
  const imageBuffer = Buffer.from(imageBase64, "base64");
  const imageFile = new File([imageBuffer], "image.png", { type: "image/png" });

  const response = await openai.images.edit({
    model: "gpt-image-1.5",
    image: imageFile,
    prompt: editPrompt,
    size: "1024x1024",
    quality: "high",
    output_format: "png",
  });

  const base64 = response.data?.[0]?.b64_json;
  if (!base64) throw new Error("No image data in OpenAI edit response");
  return { base64 };
}
