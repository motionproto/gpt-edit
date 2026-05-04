"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { buildPreserveEdgesMaskPng, loadImage } from "@/lib/mask";

// Internally the editor stores the mask as **grayscale**: white = locked,
// black = editable. On save we convert grayscale → alpha PNG (the format the
// OpenAI mask param wants: opaque = preserved, transparent = editable).

interface MaskEditorProps {
  open: boolean;
  promptImageUrl: string | null;
  customMaskUrl: string | null;
  onSaved: (project: unknown) => void;
  onClose: () => void;
}

const MIN_BRUSH = 2;
const MAX_BRUSH = 400;
const AIRBRUSH_STAMP_OPACITY = 0.18;
const AIRBRUSH_HZ = 30;

export function MaskEditor({
  open,
  promptImageUrl,
  customMaskUrl,
  onSaved,
  onClose,
}: MaskEditorProps) {
  const [brushSize, setBrushSize] = useState(40);
  const [airbrush, setAirbrush] = useState(false);
  const [color, setColor] = useState<"white" | "black">("white");
  const [busy, setBusy] = useState(false);

  const sourceImgRef = useRef<HTMLImageElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null); // offscreen, grayscale
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const drawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const airbrushTimerRef = useRef<number | null>(null);
  const stationaryPosRef = useRef<{ x: number; y: number } | null>(null);

  const colorRef = useRef(color);
  const brushSizeRef = useRef(brushSize);
  const airbrushRef = useRef(airbrush);
  useEffect(() => {
    colorRef.current = color;
  }, [color]);
  useEffect(() => {
    brushSizeRef.current = brushSize;
  }, [brushSize]);
  useEffect(() => {
    airbrushRef.current = airbrush;
  }, [airbrush]);

  const renderDisplay = useCallback(() => {
    const display = displayCanvasRef.current;
    const mask = maskCanvasRef.current;
    const src = sourceImgRef.current;
    if (!display || !mask || !src) return;
    const { w, h } = sizeRef.current;
    const ctx = display.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);

    const mctx = mask.getContext("2d");
    if (!mctx) return;
    const md = mctx.getImageData(0, 0, w, h);
    const overlay = ctx.createImageData(w, h);
    for (let i = 0; i < md.data.length; i += 4) {
      const gray = md.data[i];
      overlay.data[i] = 255;
      overlay.data[i + 1] = 0;
      overlay.data[i + 2] = 0;
      overlay.data[i + 3] = Math.round(gray * 0.45);
    }
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    tmp.getContext("2d")!.putImageData(overlay, 0, 0);
    ctx.drawImage(tmp, 0, 0);
  }, []);

  // Initialize: load source image and seed the mask buffer (custom if saved,
  // else auto from alpha). The async work runs in an IIFE so we don't
  // setState synchronously in the effect body.
  useEffect(() => {
    if (!open || !promptImageUrl) return;
    let cancelled = false;

    (async () => {
      try {
        const src = await loadImage(promptImageUrl);
        if (cancelled) return;
        const w = src.naturalWidth;
        const h = src.naturalHeight;
        sizeRef.current = { w, h };
        sourceImgRef.current = src;

        const mask = document.createElement("canvas");
        mask.width = w;
        mask.height = h;
        const mctx = mask.getContext("2d")!;

        // Seed the mask buffer in grayscale.
        let seedAlphaUrl: string;
        if (customMaskUrl) {
          seedAlphaUrl = customMaskUrl;
        } else {
          // Build the auto alpha mask, then drop it into a data URL we can re-load.
          const autoB64 = await buildPreserveEdgesMaskPng(promptImageUrl);
          seedAlphaUrl = `data:image/png;base64,${autoB64}`;
        }
        const seedImg = await loadImage(seedAlphaUrl);
        if (cancelled) return;

        // Decode the seed's alpha channel into grayscale on `mask`.
        const tmp = document.createElement("canvas");
        tmp.width = w;
        tmp.height = h;
        const tctx = tmp.getContext("2d")!;
        tctx.drawImage(seedImg, 0, 0, w, h);
        const seedData = tctx.getImageData(0, 0, w, h);
        const out = mctx.createImageData(w, h);
        for (let i = 0; i < seedData.data.length; i += 4) {
          const a = seedData.data[i + 3];
          out.data[i] = a;
          out.data[i + 1] = a;
          out.data[i + 2] = a;
          out.data[i + 3] = 255;
        }
        mctx.putImageData(out, 0, 0);

        maskCanvasRef.current = mask;

        const display = displayCanvasRef.current;
        if (display) {
          display.width = w;
          display.height = h;
        }
        renderDisplay();
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, promptImageUrl, customMaskUrl, renderDisplay]);

  // Stamp helpers, rebuilt as needed via refs so we can keep stable handlers.
  const stamp = useCallback((x: number, y: number) => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d");
    if (!ctx) return;
    const r = brushSizeRef.current / 2;
    if (airbrushRef.current) {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      const fill =
        colorRef.current === "white"
          ? `rgba(255,255,255,${AIRBRUSH_STAMP_OPACITY})`
          : `rgba(0,0,0,${AIRBRUSH_STAMP_OPACITY})`;
      const edge =
        colorRef.current === "white"
          ? "rgba(255,255,255,0)"
          : "rgba(0,0,0,0)";
      grad.addColorStop(0, fill);
      grad.addColorStop(1, edge);
      ctx.fillStyle = grad;
    } else {
      ctx.fillStyle = colorRef.current === "white" ? "#ffffff" : "#000000";
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // Mask buffer must stay opaque so colors don't bleed when re-stamping.
    if (airbrushRef.current) {
      // Already alpha-blended; alpha stays 255 because dest is already opaque.
    }
  }, []);

  const strokeFromTo = useCallback(
    (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const dist = Math.hypot(dx, dy);
      const spacing = Math.max(1, brushSizeRef.current / 4);
      const steps = Math.max(1, Math.ceil(dist / spacing));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        stamp(x1 + dx * t, y1 + dy * t);
      }
    },
    [stamp]
  );

  const stopAirbrushTimer = () => {
    if (airbrushTimerRef.current !== null) {
      window.clearInterval(airbrushTimerRef.current);
      airbrushTimerRef.current = null;
    }
    stationaryPosRef.current = null;
  };

  const eventToCanvasPos = (e: React.PointerEvent) => {
    const display = displayCanvasRef.current;
    if (!display) return null;
    const rect = display.getBoundingClientRect();
    const sx = display.width / rect.width;
    const sy = display.height / rect.height;
    return {
      x: (e.clientX - rect.left) * sx,
      y: (e.clientY - rect.top) * sy,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!maskCanvasRef.current) return;
    const display = displayCanvasRef.current;
    if (!display) return;
    display.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = eventToCanvasPos(e);
    if (!p) return;
    lastPosRef.current = p;
    stamp(p.x, p.y);
    renderDisplay();
    if (airbrushRef.current) {
      stationaryPosRef.current = p;
      airbrushTimerRef.current = window.setInterval(() => {
        const sp = stationaryPosRef.current;
        if (!sp) return;
        stamp(sp.x, sp.y);
        renderDisplay();
      }, 1000 / AIRBRUSH_HZ);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const p = eventToCanvasPos(e);
    if (!p) return;
    const last = lastPosRef.current;
    if (last) strokeFromTo(last.x, last.y, p.x, p.y);
    else stamp(p.x, p.y);
    lastPosRef.current = p;
    if (airbrushRef.current) stationaryPosRef.current = p;
    renderDisplay();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPosRef.current = null;
    stopAirbrushTimer();
    const display = displayCanvasRef.current;
    if (display) display.releasePointerCapture(e.pointerId);
  };

  // Keyboard shortcuts: [ ] for brush size, X / Z to flip color.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
        return;
      }
      if (e.key === "[") {
        e.preventDefault();
        setBrushSize((s) => Math.max(MIN_BRUSH, Math.round(s / 1.2)));
      } else if (e.key === "]") {
        e.preventDefault();
        setBrushSize((s) => Math.min(MAX_BRUSH, Math.round(s * 1.2)));
      } else if (e.key === "x" || e.key === "X" || e.key === "z" || e.key === "Z") {
        e.preventDefault();
        setColor((c) => (c === "white" ? "black" : "white"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    return () => stopAirbrushTimer();
  }, []);

  const exportAlphaPngBlob = async (): Promise<Blob> => {
    const mask = maskCanvasRef.current;
    if (!mask) throw new Error("mask buffer missing");
    const { w, h } = sizeRef.current;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d")!;
    const mctx = mask.getContext("2d")!;
    const data = mctx.getImageData(0, 0, w, h);
    const out = tctx.createImageData(w, h);
    for (let i = 0; i < data.data.length; i += 4) {
      out.data[i] = 255;
      out.data[i + 1] = 255;
      out.data[i + 2] = 255;
      out.data[i + 3] = data.data[i]; // gray → alpha
    }
    tctx.putImageData(out, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      tmp.toBlob((blob) => {
        if (!blob) reject(new Error("toBlob produced no blob"));
        else resolve(blob);
      }, "image/png");
    });
  };

  const handleSave = async () => {
    setBusy(true);
    try {
      const blob = await exportAlphaPngBlob();
      const form = new FormData();
      form.append("file", new File([blob], "mask.png", { type: "image/png" }));
      const res = await fetch("/api/prompt-mask", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Save failed: ${data.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.project) onSaved(data.project);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleResetToAuto = async () => {
    if (!promptImageUrl) return;
    setBusy(true);
    try {
      // Server-clear the saved mask, then re-seed the buffer from auto.
      const res = await fetch("/api/prompt-mask", { method: "DELETE" });
      if (res.ok) {
        const data = await res.json();
        if (data.project) onSaved(data.project);
      }
      const autoB64 = await buildPreserveEdgesMaskPng(promptImageUrl);
      const seedImg = await loadImage(`data:image/png;base64,${autoB64}`);
      const mask = maskCanvasRef.current;
      if (!mask) return;
      const { w, h } = sizeRef.current;
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(seedImg, 0, 0, w, h);
      const seedData = tctx.getImageData(0, 0, w, h);
      const mctx = mask.getContext("2d")!;
      const out = mctx.createImageData(w, h);
      for (let i = 0; i < seedData.data.length; i += 4) {
        const a = seedData.data[i + 3];
        out.data[i] = a;
        out.data[i + 1] = a;
        out.data[i + 2] = a;
        out.data[i + 3] = 255;
      }
      mctx.putImageData(out, 0, 0);
      renderDisplay();
    } finally {
      setBusy(false);
    }
  };

  // Stretches the supplied image into the mask buffer, converting to gray.
  // If the image has any alpha < 255, that alpha is used as the gray (so an
  // alpha-only mask PNG round-tripped through Photoshop comes back faithful).
  // Otherwise we compute luminance from RGB.
  const importImageAsMask = async (file: File | Blob) => {
    const blob = file instanceof Blob ? file : (file as File);
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const { w, h } = sizeRef.current;
      if (!w || !h) return;

      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(img, 0, 0, w, h);
      const data = tctx.getImageData(0, 0, w, h);

      let hasTransparent = false;
      for (let i = 3; i < data.data.length; i += 4) {
        if (data.data[i] < 255) {
          hasTransparent = true;
          break;
        }
      }

      const mask = maskCanvasRef.current;
      if (!mask) return;
      const mctx = mask.getContext("2d")!;
      const out = mctx.createImageData(w, h);
      for (let i = 0; i < data.data.length; i += 4) {
        const gray = hasTransparent
          ? data.data[i + 3]
          : Math.round(
              0.299 * data.data[i] +
                0.587 * data.data[i + 1] +
                0.114 * data.data[i + 2]
            );
        out.data[i] = gray;
        out.data[i + 1] = gray;
        out.data[i + 2] = gray;
        out.data[i + 3] = 255;
      }
      mctx.putImageData(out, 0, 0);
      renderDisplay();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  // Paste an image into the modal to use as the mask.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          void importImageAsMask(file);
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const writeCanvasToClipboard = async (
    canvas: HTMLCanvasElement,
    label: string
  ) => {
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (!b) reject(new Error("toBlob produced no blob"));
          else resolve(b);
        }, "image/png");
      });
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
    } catch (e) {
      console.error(`Failed to copy ${label}:`, e);
      alert(
        `Failed to copy ${label}. Your browser may require a user gesture or block clipboard image writes.`
      );
    }
  };

  const handleCopyMask = async () => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    await writeCanvasToClipboard(mask, "mask");
  };

  const handleCopyImage = async () => {
    const src = sourceImgRef.current;
    if (!src) return;
    const { w, h } = sizeRef.current;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    tmp.getContext("2d")!.drawImage(src, 0, 0, w, h);
    await writeCanvasToClipboard(tmp, "image");
  };

  const handleFillAll = (c: "white" | "black") => {
    const mask = maskCanvasRef.current;
    if (!mask) return;
    const ctx = mask.getContext("2d")!;
    ctx.fillStyle = c === "white" ? "#ffffff" : "#000000";
    ctx.fillRect(0, 0, mask.width, mask.height);
    renderDisplay();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Edit mask</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_220px] gap-3">
          <div className="bg-neutral-950 rounded overflow-hidden flex items-center justify-center min-h-[400px]">
            <canvas
              ref={displayCanvasRef}
              className={cn(
                "max-w-full max-h-[60vh] touch-none",
                airbrush ? "cursor-crosshair" : "cursor-crosshair"
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>

          <div className="space-y-3 text-sm">
            <div className="text-[11px] text-gray-400 leading-snug">
              Red = locked (model preserves). Clear = editable. Paint white to
              lock, black to unlock. <code>[</code> / <code>]</code> resize
              brush; <code>X</code> or <code>Z</code> flips color. Paste
              (<code>Cmd/Ctrl+V</code>) imports a clipboard image as the mask.
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Color
              </label>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setColor("white")}
                  className={cn(
                    "flex-1 px-2 py-1 text-xs rounded border",
                    color === "white"
                      ? "border-blue-500 bg-blue-500/20 text-blue-200"
                      : "border-neutral-700 text-gray-300 hover:bg-neutral-800"
                  )}
                >
                  White (lock)
                </button>
                <button
                  type="button"
                  onClick={() => setColor("black")}
                  className={cn(
                    "flex-1 px-2 py-1 text-xs rounded border",
                    color === "black"
                      ? "border-blue-500 bg-blue-500/20 text-blue-200"
                      : "border-neutral-700 text-gray-300 hover:bg-neutral-800"
                  )}
                >
                  Black (edit)
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input
                type="checkbox"
                checked={airbrush}
                onChange={(e) => setAirbrush(e.target.checked)}
                className="h-4 w-4 accent-blue-500"
              />
              Airbrush
            </label>

            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Brush size: {brushSize}px
              </label>
              <input
                type="range"
                min={MIN_BRUSH}
                max={MAX_BRUSH}
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value, 10))}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="border-t border-neutral-700 pt-2 space-y-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleFillAll("white")}
                disabled={busy}
                className="w-full text-xs"
              >
                Fill all (lock)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleFillAll("black")}
                disabled={busy}
                className="w-full text-xs"
              >
                Fill all (edit)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleResetToAuto}
                disabled={busy}
                className="w-full text-xs"
              >
                Reset to auto
              </Button>
            </div>

            <div className="border-t border-neutral-700 pt-2 space-y-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyImage}
                disabled={busy}
                className="w-full text-xs"
              >
                Copy image
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCopyMask}
                disabled={busy}
                className="w-full text-xs"
              >
                Copy mask
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving..." : "Save mask"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
