"use client";

import {
  MAX_EDGE,
  MAX_PIXELS,
  exceedsGpt2Envelope,
  parseSize,
  predictAutoOutput,
} from "@/lib/types";

interface SizeCompareProps {
  size: string;
  source?: { w: number; h: number };
}

const VIEW = 180;
const ENVELOPE_EDGE = MAX_EDGE; // 3840 — visual ceiling; pixel cap is reflected in legend

function formatMP(pixels: number): string {
  if (pixels >= 1_000_000) return `${(pixels / 1_000_000).toFixed(2)} MP`;
  return `${(pixels / 1000).toFixed(0)} kP`;
}

type Output =
  | { kind: "explicit"; w: number; h: number }
  | { kind: "auto-predicted"; w: number; h: number }
  | { kind: "auto-unknown" };

function resolveOutput(size: string, source?: { w: number; h: number }): Output {
  const dims = parseSize(size);
  if (dims) return { kind: "explicit", w: dims.w, h: dims.h };
  if (source) {
    const pred = predictAutoOutput(source.w, source.h);
    return { kind: "auto-predicted", w: pred.w, h: pred.h };
  }
  return { kind: "auto-unknown" };
}

// Visual + explicit text comparison of input (if any), requested/predicted output,
// and the gpt-image-2 max envelope. Helps users see what they'll get back before they submit.
export function SizeCompare({ size, source }: SizeCompareProps) {
  const out = resolveOutput(size, source);
  const scale = VIEW / ENVELOPE_EDGE;
  const sourceOver = source ? exceedsGpt2Envelope(source.w, source.h) : false;

  const rectFor = (w: number, h: number) => {
    const rw = Math.min(w * scale, VIEW);
    const rh = Math.min(h * scale, VIEW);
    return { x: (VIEW - rw) / 2, y: (VIEW - rh) / 2, w: rw, h: rh };
  };

  const outRect = out.kind !== "auto-unknown" ? rectFor(out.w, out.h) : null;
  const inRect = source ? rectFor(source.w, source.h) : null;

  return (
    <div className="text-[11px] text-gray-400 space-y-2">
      <div className="font-medium text-gray-300">Input → Output</div>

      <div className="bg-neutral-950 border border-neutral-800 rounded p-2 space-y-1.5">
        {source && (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-emerald-400 font-medium">Input</span>
            <span className="tabular-nums text-gray-300">
              {source.w} × {source.h}
              <span className="text-gray-500 ml-1">({formatMP(source.w * source.h)})</span>
            </span>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-blue-400 font-medium">Output</span>
          {out.kind === "auto-unknown" ? (
            <span className="text-gray-300">auto · model picks</span>
          ) : (
            <span className="tabular-nums text-gray-300">
              {out.w} × {out.h}
              <span className="text-gray-500 ml-1">({formatMP(out.w * out.h)})</span>
              {out.kind === "auto-predicted" && (
                <span className="text-amber-400/80 ml-2">predicted</span>
              )}
            </span>
          )}
        </div>
        {sourceOver && (
          <div className="text-amber-300 leading-snug pt-1 border-t border-neutral-800">
            Input exceeds gpt-image-2 caps ({MAX_EDGE} max edge ·{" "}
            {formatMP(MAX_PIXELS)} max pixels). The API will downscale before
            generating — output won&apos;t match input dimensions.
          </div>
        )}
      </div>

      <svg
        width={VIEW}
        height={VIEW}
        className="bg-neutral-950 border border-neutral-800 rounded block"
      >
        <rect
          x={0.5}
          y={0.5}
          width={VIEW - 1}
          height={VIEW - 1}
          fill="none"
          stroke="#525252"
          strokeDasharray="3 3"
        />
        {inRect && (
          <rect
            x={inRect.x}
            y={inRect.y}
            width={inRect.w}
            height={inRect.h}
            fill="rgba(16,185,129,0.10)"
            stroke="#10b981"
            strokeWidth={1}
            strokeDasharray={sourceOver ? "4 2" : undefined}
          />
        )}
        {outRect && (
          <rect
            x={outRect.x}
            y={outRect.y}
            width={outRect.w}
            height={outRect.h}
            fill="rgba(59,130,246,0.18)"
            stroke="#3b82f6"
            strokeWidth={1.5}
          />
        )}
        {out.kind === "auto-unknown" && (
          <text
            x={VIEW / 2}
            y={VIEW / 2}
            textAnchor="middle"
            fill="#6b7280"
            fontSize="11"
          >
            auto
          </text>
        )}
      </svg>

      <div className="text-gray-500">
        Max envelope: {ENVELOPE_EDGE} × {ENVELOPE_EDGE} · {formatMP(MAX_PIXELS)} cap
      </div>
    </div>
  );
}
