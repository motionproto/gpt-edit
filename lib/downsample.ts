// Client-side image downsample: load an existing image URL, draw it onto a
// canvas at smaller dims, and return a PNG File ready to re-upload.

export async function downsampleImageToFile(
  url: string,
  target: { w: number; h: number },
  filename: string
): Promise<File> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = target.w;
  canvas.height = target.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, target.w, target.h);

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
      "image/png"
    );
  });
  return new File([blob], filename, { type: "image/png" });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

// Choose a downsample target that matches the planned output size while
// preserving the source's aspect ratio (capped at the output's pixel budget).
export function pickDownsampleTarget(
  src: { w: number; h: number },
  output: { w: number; h: number }
): { w: number; h: number } {
  const srcRatio = src.w / src.h;
  // Fit output's longer edge to the source aspect.
  const outLong = Math.max(output.w, output.h);
  let w: number;
  let h: number;
  if (srcRatio >= 1) {
    w = outLong;
    h = Math.round(outLong / srcRatio);
  } else {
    h = outLong;
    w = Math.round(outLong * srcRatio);
  }
  // Round to multiples of 8 so PNG encodes cleanly and stays comfortably
  // above gpt-image-2's 16-multiple constraint when used downstream.
  w = Math.max(16, Math.round(w / 8) * 8);
  h = Math.max(16, Math.round(h / 8) * 8);
  return { w, h };
}
