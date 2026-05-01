"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  GPT_IMAGE_2_PRESETS,
  MAX_EDGE,
  MAX_PIXELS,
  MAX_RATIO,
  MIN_EDGE,
  MIN_PIXELS,
  SIZE_MULTIPLE,
  formatSize,
  parseSize,
  sizeLabel,
  snapSizeForGptImage2,
  validateSizeForModel,
} from "@/lib/types";
import { SizeCompare } from "./size-compare";

interface Gpt2SizeControlsProps {
  size: string;
  onChange: (size: string) => void;
  source?: { w: number; h: number };
}

const LAST_CUSTOM_SIZE_KEY = "gpt-edit:last-custom-size";

function readLastCustom(): { w: number; h: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_CUSTOM_SIZE_KEY);
    if (!raw) return null;
    return parseSize(raw) ?? null;
  } catch {
    return null;
  }
}

function writeLastCustom(w: number, h: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_CUSTOM_SIZE_KEY, formatSize(w, h));
  } catch {
    // ignore quota/availability errors
  }
}

export function Gpt2SizeControls({ size, onChange, source }: Gpt2SizeControlsProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState<{ w: string; h: string } | null>(null);
  const lastCustomRef = useRef<{ w: number; h: number } | null>(null);
  if (lastCustomRef.current === null) {
    lastCustomRef.current = readLastCustom();
  }

  const isPreset = (GPT_IMAGE_2_PRESETS as readonly string[]).includes(size);
  const dims = parseSize(size);
  const draftDims = customDraft
    ? {
        w: parseInt(customDraft.w, 10) || 0,
        h: parseInt(customDraft.h, 10) || 0,
      }
    : dims ?? { w: 1024, h: 1024 };

  // Mirror non-preset sizes (e.g. restored from saved state) into the remembered custom value.
  useEffect(() => {
    if (!isPreset && dims) {
      lastCustomRef.current = { w: dims.w, h: dims.h };
      writeLastCustom(dims.w, dims.h);
    }
  }, [isPreset, dims?.w, dims?.h]);

  const validation = validateSizeForModel(
    formatSize(draftDims.w, draftDims.h),
    "gpt-image-2"
  );
  const pixels = draftDims.w * draftDims.h;
  const pct = (pixels / MAX_PIXELS) * 100;
  const overBudget = pixels > MAX_PIXELS;
  const underBudget = pixels < MIN_PIXELS;

  const selectCustom = () => {
    const remembered = lastCustomRef.current;
    const fallback = dims ?? { w: 1024, h: 1024 };
    const start = remembered ?? fallback;
    setCustomDraft({ w: String(start.w), h: String(start.h) });
    onChange(formatSize(start.w, start.h));
  };

  const selectPreset = (preset: string) => {
    setCustomDraft(null);
    onChange(preset);
  };

  const commitDimension = (axis: "w" | "h", raw: string) => {
    const n = parseInt(raw, 10);
    const safe = Number.isFinite(n) && n > 0 ? n : MIN_EDGE;
    const snapped = snapSizeForGptImage2(
      axis === "w" ? safe : draftDims.w,
      axis === "h" ? safe : draftDims.h
    );
    setCustomDraft({ w: String(snapped.w), h: String(snapped.h) });
    lastCustomRef.current = snapped;
    writeLastCustom(snapped.w, snapped.h);
    onChange(formatSize(snapped.w, snapped.h));
  };

  const onDraftChange = (axis: "w" | "h", raw: string) => {
    const next = customDraft
      ? { ...customDraft, [axis]: raw }
      : {
          w: axis === "w" ? raw : String(draftDims.w),
          h: axis === "h" ? raw : String(draftDims.h),
        };
    setCustomDraft(next);
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) {
      onChange(
        formatSize(
          axis === "w" ? n : draftDims.w,
          axis === "h" ? n : draftDims.h
        )
      );
    }
  };

  return (
    <fieldset className="relative">
      <legend className="text-xs text-gray-400 mb-1 flex items-center gap-1.5">
        Size
        <button
          type="button"
          aria-label="Size constraints"
          onClick={() => setInfoOpen(!infoOpen)}
          className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-500 text-gray-400 hover:text-gray-200 hover:border-gray-300 text-[10px] leading-none"
        >
          i
        </button>
      </legend>

      {infoOpen && (
        <div className="absolute z-10 left-0 top-7 bg-neutral-900 border border-neutral-700 rounded p-3 text-xs text-gray-300 w-80 shadow-lg">
          <div className="flex items-start justify-between mb-2">
            <p className="font-medium text-gray-200">gpt-image-2 size rules</p>
            <button
              type="button"
              onClick={() => setInfoOpen(false)}
              className="text-gray-500 hover:text-gray-300 -mt-1 -mr-1 px-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <ul className="list-disc list-inside space-y-1">
            <li>Both edges must be multiples of {SIZE_MULTIPLE}px</li>
            <li>Max edge: {MAX_EDGE}px</li>
            <li>Long:short ratio ≤ {MAX_RATIO}:1</li>
            <li>
              Total pixels: {MIN_PIXELS.toLocaleString()} –{" "}
              {MAX_PIXELS.toLocaleString()}
            </li>
            <li className="text-gray-400 pt-1">
              Out-of-multiple values auto-snap to the nearest {SIZE_MULTIPLE}px on blur.
            </li>
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {GPT_IMAGE_2_PRESETS.map((s) => (
          <label
            key={s}
            className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer select-none"
          >
            <input
              type="radio"
              name="image-size"
              value={s}
              checked={isPreset && size === s}
              onChange={() => selectPreset(s)}
              className="accent-blue-500"
            />
            {sizeLabel(s)}
          </label>
        ))}
        <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer select-none">
          <input
            type="radio"
            name="image-size"
            checked={!isPreset}
            onChange={selectCustom}
            className="accent-blue-500"
          />
          Custom
        </label>
      </div>

      {!isPreset && (
        <div className="mt-2 flex items-center gap-2 text-sm text-gray-300">
          <input
            type="number"
            value={customDraft ? customDraft.w : draftDims.w}
            min={MIN_EDGE}
            max={MAX_EDGE}
            step={SIZE_MULTIPLE}
            onChange={(e) => onDraftChange("w", e.target.value)}
            onBlur={(e) => commitDimension("w", e.target.value)}
            className="w-24 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
          />
          <span className="text-gray-500">×</span>
          <input
            type="number"
            value={customDraft ? customDraft.h : draftDims.h}
            min={MIN_EDGE}
            max={MAX_EDGE}
            step={SIZE_MULTIPLE}
            onChange={(e) => onDraftChange("h", e.target.value)}
            onBlur={(e) => commitDimension("h", e.target.value)}
            className="w-24 bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
          />
        </div>
      )}

      <div className="mt-2 w-full max-w-xs">
        <div className="h-2 w-full bg-neutral-950 border border-neutral-700 rounded overflow-hidden">
          <div
            className={cn(
              "h-full transition-all",
              overBudget ? "bg-red-500" : underBudget ? "bg-yellow-500" : "bg-blue-500"
            )}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
        <div className="text-[11px] text-gray-400 mt-1">
          {pct.toFixed(1)}% of max pixels ({pixels.toLocaleString()} /{" "}
          {MAX_PIXELS.toLocaleString()}) · max edge {MAX_EDGE}px
        </div>
        {!validation.valid && (
          <div className="text-[11px] text-red-400 mt-0.5">{validation.reason}</div>
        )}
      </div>

      <div className="mt-3 max-w-xs">
        <SizeCompare size={size} source={source} />
      </div>
    </fieldset>
  );
}
