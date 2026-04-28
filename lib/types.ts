export interface ImageVariant {
  id: string;
  filename: string;
  prompt: string;
  generatedAt: string;
}

export interface Project {
  prompt: string;
  modelId: string;
  images: (ImageVariant | null)[];
}

export interface ImageModel {
  id: string;
  name: string;
  supportsEdit: boolean;
}

export const IMAGE_MODELS: ImageModel[] = [
  { id: "openai-gpt-image-1.5", name: "OpenAI gpt-image-1.5", supportsEdit: true },
  { id: "google-imagen-4", name: "Google Imagen 4.0", supportsEdit: false },
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash Image", supportsEdit: false },
];

export const VARIANT_COUNT = 3;

export const defaultProject: Project = {
  prompt: "",
  modelId: IMAGE_MODELS[0].id,
  images: Array(VARIANT_COUNT).fill(null),
};
