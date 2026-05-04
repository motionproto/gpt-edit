"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { downsampleImageToFile, pickDownsampleTarget } from "@/lib/downsample";
import { formatCost, imageInputCost } from "@/lib/cost";
import type { Project, ReferenceImage } from "@/lib/types";

export type OversizeKind = "promptImage" | "reference";

export interface OversizeItem {
  kind: OversizeKind;
  image: ReferenceImage;
  index: number; // reference slot index, or 0 for promptImage
  src: { w: number; h: number };
  target: { w: number; h: number };
  perCallSavings: number; // dollars saved per single API call
}

interface Props {
  items: OversizeItem[];
  variantCount: number;
  onProjectUpdate: (project: Project) => void;
  disabled?: boolean;
}

export function OversizeInputsWarning({
  items,
  variantCount,
  onProjectUpdate,
  disabled,
}: Props) {
  if (items.length === 0) return null;
  return (
    <div className="rounded border border-amber-700/50 bg-amber-950/30 p-3 space-y-2">
      <div className="text-xs text-amber-200">
        Large input images detected — they get rescaled by the API anyway, so
        downsampling locally cuts cost without changing results.
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <OversizeRow
            key={`${item.kind}-${item.image.id}`}
            item={item}
            variantCount={variantCount}
            onProjectUpdate={onProjectUpdate}
            disabled={disabled}
          />
        ))}
      </ul>
    </div>
  );
}

function OversizeRow({
  item,
  variantCount,
  onProjectUpdate,
  disabled,
}: {
  item: OversizeItem;
  variantCount: number;
  onProjectUpdate: (project: Project) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const label =
    item.kind === "promptImage"
      ? "Prompt image"
      : `Reference ${item.index + 1}`;
  const perJob = item.perCallSavings * variantCount;

  const downsample = async () => {
    setBusy(true);
    try {
      const url = `/api/images/${item.image.filename}`;
      const file = await downsampleImageToFile(
        url,
        item.target,
        `${label.toLowerCase().replace(/\s+/g, "-")}.png`
      );
      const form = new FormData();
      form.append("file", file);
      const endpoint =
        item.kind === "promptImage"
          ? { url: "/api/prompt-image", method: "POST" }
          : { url: `/api/references/${item.image.id}`, method: "PUT" };
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

  return (
    <li className="flex items-center justify-between gap-3 text-xs text-amber-100">
      <span>
        <span className="font-medium">{label}</span>{" "}
        ({item.src.w}×{item.src.h}) — saves{" "}
        <span className="font-medium">{formatCost(perJob)}</span> per job
        {variantCount > 1 ? ` (${formatCost(item.perCallSavings)} per call)` : ""}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || disabled}
        onClick={downsample}
        className="h-7 text-xs"
      >
        {busy ? "Downsampling..." : `Downsample to ${item.target.w}×${item.target.h}`}
      </Button>
    </li>
  );
}

// Build the oversize list from project state + planned output dims.
// Threshold: an input is "oversize" when downsampling to the output would
// save more than $0.005 per call (i.e., the saving is real money over a job).
const SAVINGS_THRESHOLD = 0.005;

export function findOversizeInputs(
  promptImage: ReferenceImage | null,
  references: ReferenceImage[],
  output: { w: number; h: number } | null
): OversizeItem[] {
  if (!output) return [];
  const items: OversizeItem[] = [];
  const consider = (image: ReferenceImage, kind: OversizeKind, index: number) => {
    if (!image.width || !image.height) return;
    if (image.width * image.height <= output.w * output.h) return;
    const target = pickDownsampleTarget(
      { w: image.width, h: image.height },
      output
    );
    if (target.w * target.h >= image.width * image.height) return;
    const before = imageInputCost({ w: image.width, h: image.height });
    const after = imageInputCost(target);
    const saving = before - after;
    if (saving < SAVINGS_THRESHOLD) return;
    items.push({
      kind,
      image,
      index,
      src: { w: image.width, h: image.height },
      target,
      perCallSavings: saving,
    });
  };
  if (promptImage) consider(promptImage, "promptImage", 0);
  references.forEach((ref, i) => consider(ref, "reference", i));
  return items;
}
