export interface ImageVariant {
  id: string;
  filename: string;
  prompt: string;
  generatedAt: string;
}

export interface ReferenceImage {
  id: string;
  filename: string;
  uploadedAt: string;
  width?: number;
  height?: number;
}

export const IMAGE_MODELS = ["gpt-image-2", "gpt-image-1.5"] as const;
export type ImageModel = (typeof IMAGE_MODELS)[number];

export const IMAGE_MODEL_LABELS: Record<ImageModel, string> = {
  "gpt-image-2": "GPT Image 2 (latest)",
  "gpt-image-1.5": "GPT Image 1.5",
};

// gpt-image-1.5 has a fixed enum of allowed sizes.
export const GPT_IMAGE_15_SIZES = [
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
] as const;

// Curated presets shown as radios for gpt-image-2. Custom sizes are also valid.
export const GPT_IMAGE_2_PRESETS = [
  "auto",
  "1024x1024",
  "1536x1024",
  "1024x1536",
  "2048x1152",
] as const;

export const SIZE_LABELS: Record<string, string> = {
  auto: "Auto",
  "1024x1024": "1024 × 1024",
  "1536x1024": "1536 × 1024",
  "1024x1536": "1024 × 1536",
  "2048x1152": "2048 × 1152",
};

// gpt-image-2 size constraints (from the OpenAI image-generation guide).
export const MAX_PIXELS = 8_294_400;
export const MIN_PIXELS = 655_360;
export const MAX_EDGE = 3840;
export const MIN_EDGE = 16;
export const SIZE_MULTIPLE = 16;
export const MAX_RATIO = 3;

// Only gpt-image-1.5 supports transparent backgrounds.
export const SUPPORTS_TRANSPARENT: Record<ImageModel, boolean> = {
  "gpt-image-2": false,
  "gpt-image-1.5": true,
};

export function parseSize(size: string): { w: number; h: number } | null {
  if (size === "auto") return null;
  const m = size.match(/^(\d+)x(\d+)$/);
  if (!m) return null;
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
}

export function formatSize(w: number, h: number): string {
  return `${w}x${h}`;
}

export function roundToMultiple(n: number, m: number = SIZE_MULTIPLE): number {
  return Math.round(n / m) * m;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export interface SizeValidation {
  valid: boolean;
  reason?: string;
}

export function validateSizeForModel(size: string, model: ImageModel): SizeValidation {
  if (size === "auto") return { valid: true };

  if (model === "gpt-image-1.5") {
    return (GPT_IMAGE_15_SIZES as readonly string[]).includes(size)
      ? { valid: true }
      : {
          valid: false,
          reason: "gpt-image-1.5 only supports 1024×1024, 1536×1024, 1024×1536",
        };
  }

  // gpt-image-2 — continuous range with constraints.
  const dims = parseSize(size);
  if (!dims) return { valid: false, reason: "Size must be in WIDTHxHEIGHT format" };
  const { w, h } = dims;

  if (w % SIZE_MULTIPLE !== 0 || h % SIZE_MULTIPLE !== 0) {
    return { valid: false, reason: `Both edges must be multiples of ${SIZE_MULTIPLE}px` };
  }
  if (w > MAX_EDGE || h > MAX_EDGE) {
    return { valid: false, reason: `Max edge is ${MAX_EDGE}px` };
  }
  if (w < MIN_EDGE || h < MIN_EDGE) {
    return { valid: false, reason: `Min edge is ${MIN_EDGE}px` };
  }

  const long = Math.max(w, h);
  const short = Math.min(w, h);
  if (long / short > MAX_RATIO) {
    return { valid: false, reason: `Long:short ratio must be ≤ ${MAX_RATIO}:1` };
  }

  const pixels = w * h;
  if (pixels < MIN_PIXELS) {
    return {
      valid: false,
      reason: `Total pixels must be at least ${MIN_PIXELS.toLocaleString()}`,
    };
  }
  if (pixels > MAX_PIXELS) {
    return {
      valid: false,
      reason: `Total pixels must be at most ${MAX_PIXELS.toLocaleString()}`,
    };
  }

  return { valid: true };
}

// Snap arbitrary dimensions onto the nearest valid gpt-image-2 size.
export function snapSizeForGptImage2(w: number, h: number): { w: number; h: number } {
  return {
    w: clamp(roundToMultiple(w), MIN_EDGE, MAX_EDGE),
    h: clamp(roundToMultiple(h), MIN_EDGE, MAX_EDGE),
  };
}

// Predict the dimensions gpt-image-2 will output for size="auto" given a source image.
// Caps: max edge 3840, max pixels 8.29M, both edges multiples of 16. The API mirrors
// source dims when they fit and scales down (preserving aspect) when they don't.
// We round down to multiples of 16 so the result stays within budget.
export function predictAutoOutput(srcW: number, srcH: number): { w: number; h: number } {
  let w = srcW;
  let h = srcH;

  const longEdge = Math.max(w, h);
  if (longEdge > MAX_EDGE) {
    const s = MAX_EDGE / longEdge;
    w *= s;
    h *= s;
  }

  if (w * h > MAX_PIXELS) {
    const s = Math.sqrt(MAX_PIXELS / (w * h));
    w *= s;
    h *= s;
  }

  w = clamp(Math.floor(w / SIZE_MULTIPLE) * SIZE_MULTIPLE, MIN_EDGE, MAX_EDGE);
  h = clamp(Math.floor(h / SIZE_MULTIPLE) * SIZE_MULTIPLE, MIN_EDGE, MAX_EDGE);
  return { w, h };
}

// True when an image's dimensions exceed any gpt-image-2 cap (edge or pixel total).
export function exceedsGpt2Envelope(w: number, h: number): boolean {
  return Math.max(w, h) > MAX_EDGE || w * h > MAX_PIXELS;
}

// CSS aspect-ratio string for a given size. `auto` falls back to square.
export function aspectRatioForSize(size: string): string {
  const dims = parseSize(size);
  if (!dims) return "1 / 1";
  return `${dims.w} / ${dims.h}`;
}

export function sizeLabel(size: string): string {
  if (SIZE_LABELS[size]) return SIZE_LABELS[size];
  const dims = parseSize(size);
  if (!dims) return size;
  return `${dims.w} × ${dims.h}`;
}

export interface Project {
  prompt: string;
  transparent: boolean;
  preserveEdges: boolean;
  size: string;
  model: ImageModel;
  images: (ImageVariant | null)[];
  referenceImages: ReferenceImage[];
  promptImage: ReferenceImage | null;
  promptMask: ReferenceImage | null;
}

export const VARIANT_COUNT = 3;
export const MAX_REFERENCES = 8;

export const defaultProject: Project = {
  prompt: "",
  transparent: false,
  preserveEdges: false,
  size: "1024x1024",
  model: "gpt-image-2",
  images: Array(VARIANT_COUNT).fill(null),
  referenceImages: [],
  promptImage: null,
  promptMask: null,
};
