// Client-side helpers for building edit masks. These touch the DOM (canvas,
// Image, FileReader) so only import from client components.

// OpenAI mask convention: TRANSPARENT pixels in the mask = editable region;
// OPAQUE pixels = preserved. So to lock the edges of a cut-out PNG we want the
// mask to be opaque exactly where the source's alpha is 0 (background), and
// transparent where the source has subject pixels.

const FALLBACK_RING_FRACTION = 0.04; // 4% of the shorter edge for opaque sources
const FALLBACK_RING_MIN_PX = 8;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

export function canvasToBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("toBlob produced no blob"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

// Returns base64-encoded PNG. If the source has any partially-transparent
// pixels, the mask is built by inverting the source alpha (cut-out workflow).
// Otherwise, falls back to a border ring so "preserve edges" still has meaning
// for fully opaque sources.
export async function buildPreserveEdgesMaskPng(sourceUrl: string): Promise<string> {
  const img = await loadImage(sourceUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0) throw new Error("Source image has zero dimensions");

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = w;
  srcCanvas.height = h;
  const srcCtx = srcCanvas.getContext("2d");
  if (!srcCtx) throw new Error("2D canvas not supported");
  srcCtx.drawImage(img, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  let hasTransparent = false;
  for (let i = 3; i < srcData.length; i += 4) {
    if (srcData[i] < 255) {
      hasTransparent = true;
      break;
    }
  }

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = w;
  maskCanvas.height = h;
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("2D canvas not supported");
  const out = maskCtx.createImageData(w, h);

  if (hasTransparent) {
    for (let i = 0; i < out.data.length; i += 4) {
      out.data[i] = 255;
      out.data[i + 1] = 255;
      out.data[i + 2] = 255;
      out.data[i + 3] = 255 - srcData[i + 3];
    }
  } else {
    const ring = Math.max(
      FALLBACK_RING_MIN_PX,
      Math.round(Math.min(w, h) * FALLBACK_RING_FRACTION)
    );
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const nearEdge =
          x < ring || x >= w - ring || y < ring || y >= h - ring;
        out.data[idx] = 255;
        out.data[idx + 1] = 255;
        out.data[idx + 2] = 255;
        out.data[idx + 3] = nearEdge ? 255 : 0;
      }
    }
  }

  maskCtx.putImageData(out, 0, 0);
  return canvasToBase64(maskCanvas);
}

// Fetches a server-saved mask PNG and returns base64 (no data: prefix).
async function fetchMaskBase64(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`mask fetch failed: ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(blob);
  });
}

// At submit time: prefer a saved custom mask, otherwise build the auto mask
// from the prompt image's alpha. Returns the base64 PNG to send to the API.
export async function resolvePreserveEdgesMaskBase64({
  promptImageUrl,
  customMaskUrl,
}: {
  promptImageUrl: string;
  customMaskUrl: string | null;
}): Promise<string> {
  if (customMaskUrl) return fetchMaskBase64(customMaskUrl);
  return buildPreserveEdgesMaskPng(promptImageUrl);
}
