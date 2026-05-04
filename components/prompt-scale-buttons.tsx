"use client";

import { cn } from "@/lib/utils";
import { formatSize, predictAutoOutput } from "@/lib/types";

interface PromptScaleButtonsProps {
  source: { w: number; h: number };
  currentSize: string;
  onChange: (size: string) => void;
  disabled?: boolean;
}

const SCALES = [1, 2, 3, 4] as const;

export function PromptScaleButtons({
  source,
  currentSize,
  onChange,
  disabled,
}: PromptScaleButtonsProps) {
  const computed = SCALES.map((n) => {
    const fit = predictAutoOutput(source.w * n, source.h * n);
    return { n, w: fit.w, h: fit.h, size: formatSize(fit.w, fit.h) };
  });

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-gray-400">Scale output</span>
      <div className="flex gap-1">
        {computed.map((c, i) => {
          const prev = i > 0 ? computed[i - 1] : null;
          const cappedToPrev = !!prev && prev.size === c.size;
          const isCurrent = c.size === currentSize;
          return (
            <button
              key={c.n}
              type="button"
              onClick={() => onChange(c.size)}
              disabled={disabled || cappedToPrev}
              title={`${c.w} × ${c.h}${cappedToPrev ? " (max reached)" : ""}`}
              className={cn(
                "px-2 py-1 text-xs rounded border",
                isCurrent
                  ? "border-blue-500 bg-blue-500/20 text-blue-200"
                  : "border-neutral-700 text-gray-300 hover:bg-neutral-800",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              {c.n}×
            </button>
          );
        })}
      </div>
    </div>
  );
}
