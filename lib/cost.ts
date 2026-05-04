import { ImageModel, parseSize, predictAutoOutput } from "./types";

// gpt-image-1 family pricing, $/token. The codebase's "gpt-image-2" / "gpt-image-1.5"
// names hit the same API surface, so we apply the same rates.
const TEXT_INPUT_PER_TOKEN = 5 / 1_000_000;
const IMAGE_INPUT_PER_TOKEN = 10 / 1_000_000;
const IMAGE_OUTPUT_PER_TOKEN = 40 / 1_000_000;

// Documented quality=high output token counts:
//   1024×1024 → 4160, 1024×1536 → 6240, 1536×1024 → 6208 (~3960 tok/MP).
const OUTPUT_TOKENS_PER_PIXEL = 3960 / 1_048_576;

// Loose: image inputs are billed by visual patches; ~750 tok/MP lines up with
// the documented ~$0.0075 per 1024² high-detail input.
const INPUT_TOKENS_PER_PIXEL = 750 / 1_048_576;

function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function imageTokens(dims: { w: number; h: number }, perPixel: number): number {
  return Math.round(dims.w * dims.h * perPixel);
}

export function imageInputCost(dims: { w: number; h: number }): number {
  return imageTokens(dims, INPUT_TOKENS_PER_PIXEL) * IMAGE_INPUT_PER_TOKEN;
}

export interface CostInputs {
  prompt: string;
  size: string;
  model: ImageModel;
  variantCount: number;
  // Caller passes only inputs with known dimensions; pass `unknownInputCount`
  // for any whose dims couldn't be read so the estimate can flag itself as partial.
  inputImageDims: { w: number; h: number }[];
  unknownInputCount?: number;
  // Used to predict output dims when size === "auto".
  autoSourceDims?: { w: number; h: number };
}

export interface CostEstimate {
  textTokens: number;
  inputImageTokens: number;
  outputImageTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
  predictedOutput: { w: number; h: number } | null;
  // True when at least one input image was excluded for missing dims.
  partial: boolean;
}

function resolveOutputDims(
  size: string,
  model: ImageModel,
  autoSourceDims?: { w: number; h: number }
): { w: number; h: number } | null {
  const parsed = parseSize(size);
  if (parsed) return parsed;
  if (!autoSourceDims) return null;
  if (model === "gpt-image-1.5") return { w: 1024, h: 1024 };
  return predictAutoOutput(autoSourceDims.w, autoSourceDims.h);
}

export function estimateJobCost(inputs: CostInputs): CostEstimate {
  const {
    prompt,
    size,
    model,
    variantCount,
    inputImageDims,
    unknownInputCount = 0,
    autoSourceDims,
  } = inputs;

  const perVariantText = estimateTextTokens(prompt);
  const perVariantImageIn = inputImageDims.reduce(
    (sum, d) => sum + imageTokens(d, INPUT_TOKENS_PER_PIXEL),
    0
  );

  const outDims = resolveOutputDims(size, model, autoSourceDims);
  const perVariantOut = outDims ? imageTokens(outDims, OUTPUT_TOKENS_PER_PIXEL) : 0;

  const textTokens = perVariantText * variantCount;
  const inputImageTokens = perVariantImageIn * variantCount;
  const outputImageTokens = perVariantOut * variantCount;

  const inputCost =
    textTokens * TEXT_INPUT_PER_TOKEN + inputImageTokens * IMAGE_INPUT_PER_TOKEN;
  const outputCost = outputImageTokens * IMAGE_OUTPUT_PER_TOKEN;

  return {
    textTokens,
    inputImageTokens,
    outputImageTokens,
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    predictedOutput: outDims,
    partial: unknownInputCount > 0 || outDims === null,
  };
}

export function formatCost(dollars: number): string {
  if (dollars <= 0) return "$0.00";
  if (dollars < 0.01) return "<$0.01";
  return `$${dollars.toFixed(2)}`;
}
