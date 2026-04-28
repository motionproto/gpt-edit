export interface ImageVariant {
  id: string;
  filename: string;
  prompt: string;
  generatedAt: string;
}

export interface Project {
  prompt: string;
  transparent: boolean;
  images: (ImageVariant | null)[];
}

export const VARIANT_COUNT = 3;

export const defaultProject: Project = {
  prompt: "",
  transparent: false,
  images: Array(VARIANT_COUNT).fill(null),
};
