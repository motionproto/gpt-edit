"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  EditorCanvas,
  buildMaskPng,
  resizeImage,
  type MaskRect,
} from "@/components/editor-canvas";
import { Gpt2SizeControls } from "@/components/gpt2-size-controls";
import { OutputSizeSlider } from "@/components/output-size-slider";
import {
  GPT_IMAGE_15_SIZES,
  IMAGE_MODELS,
  IMAGE_MODEL_LABELS,
  ImageModel,
  exceedsGpt2Envelope,
  formatSize,
  parseSize,
  predictAutoOutput,
  sizeLabel,
  snapSizeForGptImage2,
  validateSizeForModel,
} from "@/lib/types";

interface WorkingImage {
  url: string;       // data: URL or blob: URL for display
  blob: Blob;        // raw bytes for re-uploads
  w: number;
  h: number;
}

const MAX_HISTORY = 10;

export default function EditorPage() {
  const [working, setWorking] = useState<WorkingImage | null>(null);
  const [history, setHistory] = useState<WorkingImage[]>([]);
  const [busy, setBusy] = useState<null | "edit" | "mask" | "resize">(null);
  const [model, setModel] = useState<ImageModel>("gpt-image-2");
  const [size, setSize] = useState<string>("auto");
  const [prompt, setPrompt] = useState("");
  const [maskMode, setMaskMode] = useState(false);
  const [rect, setRect] = useState<MaskRect | null>(null);
  const [resizeW, setResizeW] = useState<string>("1024");
  const [resizeH, setResizeH] = useState<string>("1024");
  const [resizeAspectLocked, setResizeAspectLocked] = useState(true);
  const [advancedSize, setAdvancedSize] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep resize inputs in sync with whatever is currently loaded.
  useEffect(() => {
    if (working) {
      setResizeW(String(working.w));
      setResizeH(String(working.h));
    }
  }, [working?.w, working?.h]);

  // Default the requested output size to the max-fit dims for the working image.
  // Re-anchors after every edit so the user always sees what they'll get back.
  useEffect(() => {
    if (!working) return;
    if (model !== "gpt-image-2") return;
    if (advancedSize) return;
    const fit = predictAutoOutput(working.w, working.h);
    const next = formatSize(fit.w, fit.h);
    if (next !== size) setSize(next);
    // Intentionally exclude `size` from deps — we only want to re-anchor when
    // the working image or model changes, not when the slider is adjusted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working?.w, working?.h, model, advancedSize]);

  const loadFile = async (file: File) => {
    const blob = file.slice(0, file.size, file.type);
    const url = URL.createObjectURL(blob);
    const dims = await readImageDims(url);
    pushWorking({ url, blob, w: dims.w, h: dims.h });
  };

  // Paste-from-clipboard. Window-level so it works whether or not an image is
  // already loaded; we only preventDefault when we actually consume an image,
  // so pasting text into the prompt textarea still behaves normally.
  const loadFileRef = useRef(loadFile);
  loadFileRef.current = loadFile;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void loadFileRef.current(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const pushWorking = (img: WorkingImage) => {
    setWorking((prev) => {
      if (prev) setHistory((h) => [...h.slice(-MAX_HISTORY + 1), prev]);
      return img;
    });
    setRect(null);
    setMaskMode(false);
  };

  const undo = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const next = [...h];
      const prev = next.pop()!;
      setWorking(prev);
      return next;
    });
    setRect(null);
    setMaskMode(false);
  };

  const reset = () => {
    if (working?.url.startsWith("blob:")) URL.revokeObjectURL(working.url);
    history.forEach((h) => h.url.startsWith("blob:") && URL.revokeObjectURL(h.url));
    setWorking(null);
    setHistory([]);
    setRect(null);
    setMaskMode(false);
    setPrompt("");
  };

  const applyEdit = async (opts: { withMask: boolean }) => {
    if (!working) return;
    if (!prompt.trim()) {
      alert("Add a prompt describing the edit.");
      return;
    }

    const sizeCheck = validateSizeForModel(size, model);
    if (!sizeCheck.valid) {
      alert(`Invalid size: ${sizeCheck.reason}`);
      return;
    }

    setBusy(opts.withMask ? "mask" : "edit");
    try {
      const form = new FormData();
      form.append("image", new File([working.blob], "image.png", { type: "image/png" }));
      form.append("prompt", prompt.trim());
      form.append("size", size);
      form.append("model", model);
      if (opts.withMask) {
        if (!rect || rect.w < 4 || rect.h < 4) {
          alert("Draw a mask region first.");
          setBusy(null);
          return;
        }
        const maskBlob = await buildMaskPng(working.w, working.h, rect);
        form.append("mask", new File([maskBlob], "mask.png", { type: "image/png" }));
      }

      const res = await fetch("/api/edit-image", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Edit failed: ${data.error || res.statusText}`);
        return;
      }
      const data = (await res.json()) as { b64: string };
      const blob = b64ToPngBlob(data.b64);
      const url = URL.createObjectURL(blob);
      const dims = await readImageDims(url);
      pushWorking({ url, blob, w: dims.w, h: dims.h });
    } catch (e) {
      console.error(e);
      alert("Edit failed unexpectedly. See console.");
    } finally {
      setBusy(null);
    }
  };

  // Manual resize is canvas drawImage to whatever WxH the user specifies, which
  // squishes if W and H don't match source aspect. With the lock on (default),
  // editing one axis live-updates the other from the source ratio, and onBlur
  // snaps both axes to multiples of 16 while keeping that ratio.
  const onResizeChange = (axis: "w" | "h", val: string) => {
    if (axis === "w") setResizeW(val);
    else setResizeH(val);
    if (!resizeAspectLocked || !working) return;
    const n = parseInt(val, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    if (axis === "w") setResizeH(String(Math.round((n * working.h) / working.w)));
    else setResizeW(String(Math.round((n * working.w) / working.h)));
  };

  const onResizeBlur = (axis: "w" | "h") => {
    if (model !== "gpt-image-2") return;
    const w = parseInt(resizeW, 10);
    const h = parseInt(resizeH, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return;
    if (resizeAspectLocked && working) {
      const editedSnap = snapSizeForGptImage2(w, h);
      const wSnapped = axis === "w" ? editedSnap.w : Math.round((editedSnap.h * working.w) / working.h);
      const hSnapped = axis === "h" ? editedSnap.h : Math.round((editedSnap.w * working.h) / working.w);
      const final = snapSizeForGptImage2(wSnapped, hSnapped);
      setResizeW(String(final.w));
      setResizeH(String(final.h));
    } else {
      const s = snapSizeForGptImage2(w, h);
      setResizeW(String(s.w));
      setResizeH(String(s.h));
    }
  };

  const applyResize = async () => {
    if (!working) return;
    const w = parseInt(resizeW, 10);
    const h = parseInt(resizeH, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
      alert("Enter valid dimensions.");
      return;
    }
    setBusy("resize");
    try {
      const blob = await resizeImage(working.url, w, h);
      const url = URL.createObjectURL(blob);
      pushWorking({ url, blob, w, h });
    } catch (e) {
      console.error(e);
      alert("Resize failed.");
    } finally {
      setBusy(null);
    }
  };

  const downloadCurrent = () => {
    if (!working) return;
    const a = document.createElement("a");
    a.href = working.url;
    a.download = `edit-${Date.now()}.png`;
    a.click();
  };

  const isBusy = busy !== null;

  // True when the chosen output size won't match source dims, which means the
  // unmasked area will be resampled rather than left untouched.
  const sourceMismatch = (() => {
    if (!working) return false;
    const dims = parseSize(size);
    if (!dims) return false; // "auto" mirrors source on edit
    return dims.w !== working.w || dims.h !== working.h;
  })();

  // Source exceeds gpt-image-2 caps → API will downscale silently. Offer to do it locally.
  const sourceOversized = working
    ? exceedsGpt2Envelope(working.w, working.h)
    : false;
  const fitDims = working
    ? predictAutoOutput(working.w, working.h)
    : null;

  const fitToEnvelope = async () => {
    if (!working || !fitDims) return;
    setBusy("resize");
    try {
      const blob = await resizeImage(working.url, fitDims.w, fitDims.h);
      const url = URL.createObjectURL(blob);
      pushWorking({ url, blob, w: fitDims.w, h: fitDims.h });
    } catch (e) {
      console.error(e);
      alert("Resize failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#1a1a1a]">
      <div className="max-w-[1600px] mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Editor</h1>
          <Link
            href="/"
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            ← Back to project
          </Link>
        </div>

        {!working ? (
          <Card className="p-8 bg-[#3d3d3d] border-0">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) loadFile(f);
              }}
              className="border-2 border-dashed border-neutral-600 rounded p-12 text-center text-gray-300"
            >
              <p className="mb-4">Drop an image here, paste from your clipboard, or pick a file.</p>
              <Button onClick={() => fileInputRef.current?.click()}>Choose image</Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) loadFile(f);
                }}
              />
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
            <Card className="p-3 bg-[#3d3d3d] border-0 space-y-3">
              <div className={cn("relative", isBusy && "opacity-60 pointer-events-none")}>
                <EditorCanvas
                  src={working.url}
                  imageW={working.w}
                  imageH={working.h}
                  maskMode={maskMode}
                  rect={rect}
                  onRectChange={setRect}
                />
                {isBusy && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-black/70 rounded px-4 py-2 text-white text-sm flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-400 rounded-full animate-spin" />
                      {busy === "resize" ? "Resizing..." : busy === "mask" ? "Editing region..." : "Editing..."}
                    </div>
                  </div>
                )}
              </div>
              {sourceOversized && fitDims && (
                <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded border border-amber-700/60 bg-amber-900/20 text-xs text-amber-200">
                  <span className="leading-snug">
                    Source ({working.w}×{working.h}) exceeds gpt-image-2 caps. The
                    API will downscale to ~{fitDims.w}×{fitDims.h} before editing.
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isBusy}
                    onClick={fitToEnvelope}
                    className="ml-auto"
                  >
                    Resize to {fitDims.w}×{fitDims.h}
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                <span>
                  {working.w} × {working.h}
                </span>
                <span className="text-gray-600">·</span>
                <button
                  onClick={undo}
                  disabled={history.length === 0 || isBusy}
                  className="text-blue-400 hover:text-blue-300 disabled:text-gray-600"
                >
                  undo ({history.length})
                </button>
                <button
                  onClick={downloadCurrent}
                  disabled={isBusy}
                  className="text-blue-400 hover:text-blue-300 disabled:text-gray-600"
                >
                  download
                </button>
                <button
                  onClick={reset}
                  disabled={isBusy}
                  className="text-red-400 hover:text-red-300 disabled:text-gray-600 ml-auto"
                >
                  start over
                </button>
              </div>
            </Card>

            <Card className="p-3 bg-[#3d3d3d] border-0 space-y-4">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Model</label>
                <select
                  value={model}
                  onChange={(e) => {
                    const next = e.target.value as ImageModel;
                    setModel(next);
                    if (!validateSizeForModel(size, next).valid) setSize("auto");
                  }}
                  disabled={isBusy}
                  className="bg-neutral-800 text-gray-200 border border-neutral-700 rounded px-2 py-1 text-sm w-full"
                >
                  {IMAGE_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {IMAGE_MODEL_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                {model === "gpt-image-1.5" ? (
                  <>
                    <label className="text-xs text-gray-400 block mb-1">Output size</label>
                    <select
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      disabled={isBusy}
                      className="bg-neutral-800 text-gray-200 border border-neutral-700 rounded px-2 py-1 text-sm w-full"
                    >
                      {GPT_IMAGE_15_SIZES.map((s) => (
                        <option key={s} value={s}>
                          {sizeLabel(s)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : advancedSize ? (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">Output size (advanced)</span>
                      <button
                        onClick={() => setAdvancedSize(false)}
                        disabled={isBusy}
                        className="text-[11px] text-blue-400 hover:text-blue-300 disabled:text-gray-600"
                      >
                        use slider
                      </button>
                    </div>
                    <Gpt2SizeControls
                      size={size}
                      onChange={setSize}
                      source={{ w: working.w, h: working.h }}
                    />
                  </>
                ) : (
                  <>
                    <OutputSizeSlider
                      source={{ w: working.w, h: working.h }}
                      size={size}
                      onChange={setSize}
                      disabled={isBusy}
                    />
                    <button
                      onClick={() => setAdvancedSize(true)}
                      disabled={isBusy}
                      className="mt-2 text-[11px] text-gray-400 hover:text-gray-200 disabled:text-gray-600"
                    >
                      advanced (presets, custom dims, ratio override)
                    </button>
                  </>
                )}
              </div>

              <div>
                <label className="text-xs text-gray-400 block mb-1">Prompt</label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="e.g. 'Make it photorealistic at golden hour' or 'Replace the masked area with a flamingo'"
                  className="min-h-[80px] bg-neutral-800 text-gray-200 border-neutral-700"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => applyEdit({ withMask: false })}
                  disabled={isBusy || !prompt.trim()}
                >
                  Edit whole image
                </Button>

                <div className="border-t border-neutral-700 pt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={maskMode}
                      onChange={(e) => {
                        setMaskMode(e.target.checked);
                        if (!e.target.checked) setRect(null);
                      }}
                      disabled={isBusy}
                      className="accent-amber-500"
                    />
                    Mask mode (draw region)
                  </label>
                  {maskMode && rect && (
                    <div className="text-[11px] text-amber-400">
                      Mask region: {Math.round(rect.w)} × {Math.round(rect.h)} px
                    </div>
                  )}
                  {maskMode && sourceMismatch && (
                    <div className="text-[11px] text-amber-300/80 leading-snug">
                      Output size differs from source ({working.w}×{working.h}). The
                      whole image will be resampled — set size to “auto” to mirror
                      the source and only regenerate the masked area.
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => applyEdit({ withMask: true })}
                    disabled={isBusy || !prompt.trim() || !rect}
                    className="w-full"
                  >
                    Edit masked region
                  </Button>
                  {rect && (
                    <button
                      onClick={() => setRect(null)}
                      disabled={isBusy}
                      className="text-xs text-gray-400 hover:text-gray-200 underline"
                    >
                      clear mask
                    </button>
                  )}
                </div>

                <div className="border-t border-neutral-700 pt-3 space-y-2">
                  <label className="text-xs text-gray-400 block">
                    Resize (client-side, no AI)
                  </label>
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="number"
                      value={resizeW}
                      onChange={(e) => onResizeChange("w", e.target.value)}
                      onBlur={() => onResizeBlur("w")}
                      disabled={isBusy}
                      className="w-24 bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
                    />
                    <button
                      type="button"
                      onClick={() => setResizeAspectLocked((v) => !v)}
                      disabled={isBusy}
                      title={
                        resizeAspectLocked
                          ? "Aspect ratio locked to source — click to allow non-proportional resize"
                          : "Aspect ratio unlocked — click to relock to source ratio"
                      }
                      className={cn(
                        "p-1 rounded text-xs",
                        resizeAspectLocked
                          ? "text-blue-400 hover:text-blue-300"
                          : "text-gray-500 hover:text-gray-300",
                        isBusy && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {resizeAspectLocked ? <Lock size={14} /> : <Unlock size={14} />}
                    </button>
                    <input
                      type="number"
                      value={resizeH}
                      onChange={(e) => onResizeChange("h", e.target.value)}
                      onBlur={() => onResizeBlur("h")}
                      disabled={isBusy}
                      className="w-24 bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
                    />
                  </div>
                  <Button variant="secondary" onClick={applyResize} disabled={isBusy} className="w-full">
                    Resize now
                  </Button>
                  <p className="text-[11px] text-gray-500">
                    Need an AI upscale instead? Pick a larger output size above and use “Edit
                    whole image” with a prompt like “upscale and enhance details”.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

function readImageDims(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = url;
  });
}

function b64ToPngBlob(b64: string): Blob {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}
