"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface MaskRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EditorCanvasProps {
  src: string;
  imageW: number;
  imageH: number;
  maskMode: boolean;
  rect: MaskRect | null;
  onRectChange: (rect: MaskRect | null) => void;
}

// Renders the working image and overlays a rectangular mask region while in maskMode.
// Coordinates emitted are in image space (not display pixels).
export function EditorCanvas({
  src,
  imageW,
  imageH,
  maskMode,
  rect,
  onRectChange,
}: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);

  // Keep the canvas-to-image scale in sync with the rendered size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setScale(r.width > 0 ? r.width / imageW : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imageW]);

  const toImageCoords = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * imageW;
    const y = ((clientY - r.top) / r.height) * imageH;
    return {
      x: Math.max(0, Math.min(imageW, x)),
      y: Math.max(0, Math.min(imageH, y)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!maskMode) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toImageCoords(e.clientX, e.clientY);
    setDrawStart(p);
    onRectChange({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!maskMode || !drawStart) return;
    const p = toImageCoords(e.clientX, e.clientY);
    const x = Math.min(drawStart.x, p.x);
    const y = Math.min(drawStart.y, p.y);
    const w = Math.abs(p.x - drawStart.x);
    const h = Math.abs(p.y - drawStart.y);
    onRectChange({ x, y, w, h });
  };

  const onPointerUp = () => {
    if (!maskMode) return;
    setDrawStart(null);
    if (rect && (rect.w < 4 || rect.h < 4)) onRectChange(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none touch-none bg-neutral-900 rounded overflow-hidden"
      style={{ aspectRatio: `${imageW} / ${imageH}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Editor working image"
        className="w-full h-full object-contain pointer-events-none"
        draggable={false}
      />

      {maskMode && (
        <div
          className={cn(
            "absolute inset-0 cursor-crosshair",
            "before:absolute before:inset-0 before:bg-black/40 before:pointer-events-none"
          )}
          aria-hidden
        />
      )}

      {rect && rect.w > 0 && rect.h > 0 && (
        <div
          className="absolute border-2 border-amber-400 bg-amber-400/10 pointer-events-none"
          style={{
            left: rect.x * scale,
            top: rect.y * scale,
            width: rect.w * scale,
            height: rect.h * scale,
          }}
        />
      )}
    </div>
  );
}

// Build an alpha-channel PNG mask (matching imageW × imageH) where the rectangle
// is transparent (= editable region) and the rest is opaque (= preserved).
export function buildMaskPng(
  imageW: number,
  imageH: number,
  rect: MaskRect
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = imageW;
  canvas.height = imageH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get 2D context");
  ctx.fillStyle = "rgba(0,0,0,1)";
  ctx.fillRect(0, 0, imageW, imageH);
  ctx.clearRect(
    Math.round(rect.x),
    Math.round(rect.y),
    Math.round(rect.w),
    Math.round(rect.h)
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Failed to encode mask PNG"));
      resolve(blob);
    }, "image/png");
  });
}

// Resize an image client-side via canvas. Returns a PNG blob at exact target dimensions.
export function resizeImage(src: string, targetW: number, targetH: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not get 2D context"));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, targetW, targetH);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Failed to encode PNG"));
        resolve(blob);
      }, "image/png");
    };
    img.onerror = () => reject(new Error("Failed to load image for resize"));
    img.src = src;
  });
}
