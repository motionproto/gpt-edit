"use client";

import { useMemo } from "react";
import {
  MIN_EDGE,
  MIN_PIXELS,
  SIZE_MULTIPLE,
  formatSize,
  parseSize,
  predictAutoOutput,
  validateSizeForModel,
} from "@/lib/types";

interface OutputSizeSliderProps {
  source: { w: number; h: number };
  size: string;
  onChange: (size: string) => void;
  disabled?: boolean;
}

function snapDown(value: number): number {
  return Math.max(MIN_EDGE, Math.floor(value / SIZE_MULTIPLE) * SIZE_MULTIPLE);
}

function dimsAtScale(maxFit: { w: number; h: number }, scale: number) {
  return {
    w: snapDown(maxFit.w * scale),
    h: snapDown(maxFit.h * scale),
  };
}

// Slider that picks an output size proportional to the gpt-image-2 max-fit for the
// source image. 100% = max-fit dims (predictAutoOutput), lower = same aspect ratio,
// snapped to multiples of 16. Floor enforced by MIN_PIXELS.
export function OutputSizeSlider({
  source,
  size,
  onChange,
  disabled,
}: OutputSizeSliderProps) {
  const maxFit = useMemo(
    () => predictAutoOutput(source.w, source.h),
    [source.w, source.h]
  );

  const dims = parseSize(size);
  const currentScale = dims ? dims.w / maxFit.w : 1;
  const currentPct = Math.round(currentScale * 100);

  // Smallest scale that keeps total pixels above MIN_PIXELS (so the API accepts it).
  const minPct = useMemo(() => {
    const s = Math.sqrt(MIN_PIXELS / (maxFit.w * maxFit.h));
    return Math.max(10, Math.ceil(s * 100));
  }, [maxFit.w, maxFit.h]);

  const setPct = (pct: number) => {
    const next = dimsAtScale(maxFit, pct / 100);
    onChange(formatSize(next.w, next.h));
  };

  const validation = validateSizeForModel(size, "gpt-image-2");
  const renderedDims = dims ?? maxFit;
  const renderedMP = (renderedDims.w * renderedDims.h) / 1_000_000;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-gray-400">Output size</span>
        <span className="tabular-nums text-sm text-blue-400">
          {renderedDims.w} × {renderedDims.h}
          <span className="text-gray-500 ml-1.5">
            ({renderedMP.toFixed(2)} MP · {currentPct}%)
          </span>
        </span>
      </div>
      <input
        type="range"
        min={minPct}
        max={100}
        value={Math.min(100, Math.max(minPct, currentPct))}
        onChange={(e) => setPct(parseInt(e.target.value, 10))}
        disabled={disabled}
        className="w-full accent-blue-500"
      />
      <div className="flex justify-between text-[11px] text-gray-500">
        <span>{minPct}% · min valid</span>
        <span>
          100% · max fit ({maxFit.w}×{maxFit.h})
        </span>
      </div>
      <button
        type="button"
        onClick={() => setPct(100)}
        disabled={disabled || currentPct === 100}
        className="text-[11px] text-blue-400 hover:text-blue-300 disabled:text-gray-600"
      >
        reset to max fit
      </button>
      {!validation.valid && (
        <div className="text-[11px] text-red-400">{validation.reason}</div>
      )}
    </div>
  );
}
