"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { downsampleImageToFile } from "@/lib/downsample";
import { formatCost, imageInputCost } from "@/lib/cost";
import type { Project, ReferenceImage } from "@/lib/types";

export type BadgeKind = "promptImage" | "reference";

interface Props {
  image: ReferenceImage;
  kind: BadgeKind;
  output: { w: number; h: number } | null;
  variantCount: number;
  onProjectUpdate: (project: Project) => void;
  disabled?: boolean;
  // Compact tuning for tiny reference slots.
  size?: "sm" | "md";
}

interface Option {
  label: string;
  dims: { w: number; h: number };
  isCurrent: boolean;
}

export function ImageCostBadge({
  image,
  kind,
  output,
  variantCount,
  onProjectUpdate,
  disabled,
  size = "md",
}: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!image.width || !image.height) {
    return (
      <div
        className={cn(
          "text-gray-500",
          size === "sm" ? "text-[10px]" : "text-xs"
        )}
      >
        size unknown
      </div>
    );
  }

  const currentDims = { w: image.width, h: image.height };
  const currentCost = imageInputCost(currentDims) * variantCount;
  const options = buildOptions(currentDims, output);

  const apply = async (dims: { w: number; h: number }) => {
    setBusy(true);
    setOpen(false);
    try {
      const file = await downsampleImageToFile(
        `/api/images/${image.filename}`,
        dims,
        `${kind === "promptImage" ? "prompt-image" : "reference"}.png`
      );
      const form = new FormData();
      form.append("file", file);
      const endpoint =
        kind === "promptImage"
          ? { url: "/api/prompt-image", method: "POST" }
          : { url: `/api/references/${image.id}`, method: "PUT" };
      const res = await fetch(endpoint.url, { method: endpoint.method, body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Downsample failed: ${data.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.project) onProjectUpdate(data.project);
    } catch (e) {
      alert(`Downsample failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const summary = `${currentDims.w}×${currentDims.h} · ${formatCost(currentCost)}`;
  const downsampleOptions = options.filter((o) => !o.isCurrent);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
        title={
          variantCount > 1
            ? `Input cost across ${variantCount} variants. Click to downsample.`
            : "Input cost per call. Click to downsample."
        }
        className={cn(
          "rounded bg-neutral-900/80 hover:bg-neutral-900 border border-neutral-700",
          "text-gray-300 disabled:opacity-50 cursor-pointer",
          size === "sm"
            ? "text-[10px] px-1.5 py-0.5 leading-tight"
            : "text-xs px-2 py-0.5 leading-tight"
        )}
      >
        {busy ? "..." : summary}
      </button>

      {open && downsampleOptions.length > 0 && (
        <div
          className={cn(
            "absolute z-20 left-0 mt-1 min-w-[180px] max-w-[260px]",
            "rounded border border-neutral-700 bg-neutral-900 shadow-lg p-1 space-y-0.5"
          )}
        >
          {downsampleOptions.map((opt) => {
            const cost = imageInputCost(opt.dims) * variantCount;
            const saving = currentCost - cost;
            return (
              <button
                key={`${opt.dims.w}x${opt.dims.h}-${opt.label}`}
                type="button"
                onClick={() => apply(opt.dims)}
                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-neutral-800 text-gray-200"
              >
                <div className="flex justify-between gap-3">
                  <span>{opt.label}</span>
                  <span className="text-gray-400">
                    {opt.dims.w}×{opt.dims.h}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-[10px] text-gray-400">
                  <span>{formatCost(cost)}</span>
                  {saving > 0 && (
                    <span className="text-emerald-400">
                      −{formatCost(saving)}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Pick a shortlist of useful target sizes (always preserving aspect ratio).
function buildOptions(
  current: { w: number; h: number },
  output: { w: number; h: number } | null
): Option[] {
  const opts: Option[] = [];
  const seen = new Set<string>();
  const push = (label: string, dims: { w: number; h: number }, isCurrent = false) => {
    const key = `${dims.w}x${dims.h}`;
    if (seen.has(key)) return;
    seen.add(key);
    opts.push({ label, dims, isCurrent });
  };

  push("Current", current, true);
  if (output) {
    const matched = fitToLongEdge(current, Math.max(output.w, output.h));
    if (matched.w * matched.h < current.w * current.h) {
      push("Match output", matched);
    }
  }
  for (const longEdge of [1536, 1024, 768, 512]) {
    const fit = fitToLongEdge(current, longEdge);
    if (fit.w * fit.h < current.w * current.h) {
      push(`${longEdge}px long edge`, fit);
    }
  }
  return opts;
}

function fitToLongEdge(
  src: { w: number; h: number },
  longEdge: number
): { w: number; h: number } {
  const ratio = src.w / src.h;
  let w: number;
  let h: number;
  if (ratio >= 1) {
    w = longEdge;
    h = Math.round(longEdge / ratio);
  } else {
    h = longEdge;
    w = Math.round(longEdge * ratio);
  }
  // Snap to multiples of 8 to keep encoding clean and stay friendly to
  // gpt-image-2's 16-multiple constraint downstream.
  w = Math.max(16, Math.round(w / 8) * 8);
  h = Math.max(16, Math.round(h / 8) * 8);
  return { w, h };
}
