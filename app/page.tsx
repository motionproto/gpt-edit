"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ImageSlot } from "@/components/image-slot";
import { Lightbox, LightboxData } from "@/components/lightbox";
import { cn } from "@/lib/utils";
import {
  Project,
  VARIANT_COUNT,
  defaultProject,
  IMAGE_MODELS,
  IMAGE_MODEL_LABELS,
  GPT_IMAGE_15_SIZES,
  GPT_IMAGE_2_PRESETS,
  SUPPORTS_TRANSPARENT,
  MAX_PIXELS,
  MIN_PIXELS,
  MAX_EDGE,
  MIN_EDGE,
  SIZE_MULTIPLE,
  MAX_RATIO,
  aspectRatioForSize,
  parseSize,
  formatSize,
  sizeLabel,
  snapSizeForGptImage2,
  validateSizeForModel,
  ImageModel,
} from "@/lib/types";

export default function GptEditPage() {
  const [project, setProject] = useState<Project>(defaultProject);
  const [isLoading, setIsLoading] = useState(true);
  const [generatingSlots, setGeneratingSlots] = useState<Set<number>>(new Set());
  const [editingSlots, setEditingSlots] = useState<Set<number>>(new Set());
  const [previewVersions, setPreviewVersions] = useState<Record<number, number>>({});
  const [imageVersions, setImageVersions] = useState<Record<number, number>>({});
  const [activePreviews, setActivePreviews] = useState<Set<number>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [editDialogIndex, setEditDialogIndex] = useState<number | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [lightboxData, setLightboxData] = useState<LightboxData | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  // While typing in custom W/H inputs, hold raw strings so backspaces don't fight us.
  const [customDraft, setCustomDraft] = useState<{ w: string; h: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/project");
        const data = (await response.json()) as Project;
        setProject({ ...defaultProject, ...data });
      } catch (error) {
        console.error("Failed to load project:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const persistProject = async (
    next: Partial<Pick<Project, "prompt" | "transparent" | "size" | "model">>
  ) => {
    try {
      await fetch("/api/project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    } catch (error) {
      console.error("Failed to save project:", error);
    }
  };

  const bumpImage = (index: number) =>
    setImageVersions((prev) => ({ ...prev, [index]: (prev[index] || 0) + 1 }));
  const bumpPreview = (index: number) =>
    setPreviewVersions((prev) => ({ ...prev, [index]: (prev[index] || 0) + 1 }));

  const generate = async (variantIndex?: number) => {
    if (!project.prompt.trim()) return;

    const targets =
      typeof variantIndex === "number"
        ? [variantIndex]
        : Array.from({ length: VARIANT_COUNT }, (_, i) => i);

    setGeneratingSlots((prev) => {
      const next = new Set(prev);
      targets.forEach((i) => next.add(i));
      return next;
    });

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: project.prompt,
          transparent: project.transparent,
          size: project.size,
          model: project.model,
          ...(typeof variantIndex === "number" ? { variantIndex } : {}),
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(`Generate failed: ${data.error || response.statusText}`);
        return;
      }
      const data = await response.json();
      if (data.project) {
        setProject(data.project);
        targets.forEach(bumpImage);
      }
    } catch (error) {
      console.error("Failed to generate:", error);
    } finally {
      setGeneratingSlots((prev) => {
        const next = new Set(prev);
        targets.forEach((i) => next.delete(i));
        return next;
      });
    }
  };

  const openEditDialog = (variantIndex: number) => {
    setEditDialogIndex(variantIndex);
    setEditPrompt("");
  };

  const submitEdit = async () => {
    if (editDialogIndex === null || !editPrompt.trim()) return;
    const target = editDialogIndex;
    setEditDialogIndex(null);
    setEditingSlots((prev) => new Set(prev).add(target));

    try {
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantIndex: target, editPrompt: editPrompt.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        alert(`Edit failed: ${data.error || response.statusText}`);
        return;
      }
      bumpPreview(target);
      setActivePreviews((prev) => new Set(prev).add(target));
    } catch (error) {
      console.error("Failed to edit:", error);
    } finally {
      setEditingSlots((prev) => {
        const next = new Set(prev);
        next.delete(target);
        return next;
      });
      setEditPrompt("");
    }
  };

  const acceptEdit = async (variantIndex: number) => {
    try {
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantIndex, action: "accept" }),
      });
      const data = await response.json();
      if (data.project) setProject(data.project);
      bumpImage(variantIndex);
      setActivePreviews((prev) => {
        const next = new Set(prev);
        next.delete(variantIndex);
        return next;
      });
    } catch (error) {
      console.error("Failed to accept edit:", error);
    }
  };

  const discardEdit = async (variantIndex: number) => {
    try {
      await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantIndex, action: "discard" }),
      });
    } catch (error) {
      console.error("Failed to discard edit:", error);
    }
    setActivePreviews((prev) => {
      const next = new Set(prev);
      next.delete(variantIndex);
      return next;
    });
  };

  const updatePrompt = (value: string) => {
    setProject((prev) => ({ ...prev, prompt: value }));
  };

  const updateTransparent = (value: boolean) => {
    setProject((prev) => ({ ...prev, transparent: value }));
    persistProject({ transparent: value });
  };

  const updateSize = (value: string) => {
    setProject((prev) => ({ ...prev, size: value }));
    persistProject({ size: value });
  };

  const updateModel = (value: ImageModel) => {
    setProject((prev) => {
      const sizeOk = validateSizeForModel(prev.size, value).valid;
      const nextSize = sizeOk ? prev.size : "1024x1024";
      const nextTransparent = SUPPORTS_TRANSPARENT[value] ? prev.transparent : false;
      const next = {
        ...prev,
        model: value,
        size: nextSize,
        transparent: nextTransparent,
      };
      persistProject({
        model: value,
        size: nextSize,
        transparent: nextTransparent,
      });
      return next;
    });
    setCustomDraft(null);
  };

  const handlePromptBlur = () => {
    persistProject({ prompt: project.prompt });
  };

  const slotImagePath = (index: number) => {
    if (!project.images[index]) return undefined;
    return `/api/images/variant-${index}.png?v=${imageVersions[index] || 0}`;
  };

  const slotPreviewPath = (index: number) => {
    if (!activePreviews.has(index)) return undefined;
    return `/api/images/variant-${index}-edit.png?v=${previewVersions[index] || 0}`;
  };

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </main>
    );
  }

  const anyGenerating = generatingSlots.size > 0;
  const promptIsEmpty = !project.prompt.trim();

  return (
    <main className="min-h-screen bg-[#1a1a1a]">
      <div className="max-w-[1600px] mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold">GPT Edit</h1>

        <Card className="p-4 bg-[#3d3d3d] border-0 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Model</label>
              <select
                value={project.model}
                onChange={(e) => updateModel(e.target.value as ImageModel)}
                className="bg-neutral-800 text-gray-200 border border-neutral-700 rounded px-2 py-1 text-sm"
              >
                {IMAGE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {IMAGE_MODEL_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>

            {project.model === "gpt-image-1.5" ? (
              <fieldset>
                <legend className="text-xs text-gray-400 mb-1">Size</legend>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {GPT_IMAGE_15_SIZES.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer select-none"
                    >
                      <input
                        type="radio"
                        name="image-size"
                        value={s}
                        checked={project.size === s}
                        onChange={() => updateSize(s)}
                        className="accent-blue-500"
                      />
                      {sizeLabel(s)}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <Gpt2SizeControls
                size={project.size}
                onChange={updateSize}
                infoOpen={infoOpen}
                setInfoOpen={setInfoOpen}
                customDraft={customDraft}
                setCustomDraft={setCustomDraft}
              />
            )}

            <label
              className={cn(
                "flex items-center gap-2 text-sm select-none w-fit pb-1",
                SUPPORTS_TRANSPARENT[project.model]
                  ? "text-gray-300 cursor-pointer"
                  : "text-gray-500 cursor-not-allowed"
              )}
              title={
                SUPPORTS_TRANSPARENT[project.model]
                  ? undefined
                  : "Transparent backgrounds are not supported by gpt-image-2"
              }
            >
              <input
                type="checkbox"
                checked={project.transparent && SUPPORTS_TRANSPARENT[project.model]}
                disabled={!SUPPORTS_TRANSPARENT[project.model]}
                onChange={(e) => updateTransparent(e.target.checked)}
                className="h-4 w-4 accent-blue-500"
              />
              Transparent background
            </label>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">Prompt</label>
            <Textarea
              value={project.prompt}
              onChange={(e) => updatePrompt(e.target.value)}
              onBlur={handlePromptBlur}
              placeholder="Describe the image you want to generate..."
              className="min-h-[100px] bg-neutral-800 text-gray-200 border-neutral-700"
            />
          </div>

          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-400">
              {project.images.filter(Boolean).length} of {VARIANT_COUNT} variations generated
            </div>
            <Button
              onClick={() => generate()}
              disabled={anyGenerating || promptIsEmpty}
            >
              {anyGenerating ? "Generating..." : "Generate All"}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: VARIANT_COUNT }, (_, i) => i).map((index) => (
              <ImageSlot
                key={index}
                index={index}
                imagePath={slotImagePath(index)}
                previewPath={slotPreviewPath(index)}
                aspectRatio={aspectRatioForSize(project.size)}
                isSelected={selectedIndex === index}
                hasAnySelection={selectedIndex !== null}
                isGenerating={generatingSlots.has(index)}
                isEditing={editingSlots.has(index)}
                onRegenerate={() => generate(index)}
                onSelect={() =>
                  setSelectedIndex((prev) => (prev === index ? null : index))
                }
                onEdit={() => openEditDialog(index)}
                onAcceptEdit={() => acceptEdit(index)}
                onDiscardEdit={() => discardEdit(index)}
                onImageDoubleClick={setLightboxData}
              />
            ))}
          </div>
        </Card>
      </div>

      <Dialog
        open={editDialogIndex !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditDialogIndex(null);
            setEditPrompt("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Image</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editDialogIndex !== null && project.images[editDialogIndex] && (
              <div className="aspect-square w-48 mx-auto bg-neutral-800 rounded overflow-hidden">
                <img
                  src={slotImagePath(editDialogIndex)}
                  alt="Current image"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <Input
              autoFocus
              placeholder="Describe the edit (e.g., 'Make the sky stormy')"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && editPrompt.trim()) submitEdit();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditDialogIndex(null)}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={!editPrompt.trim()}>
              Apply Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Lightbox data={lightboxData} onClose={() => setLightboxData(null)} />
    </main>
  );
}

interface Gpt2SizeControlsProps {
  size: string;
  onChange: (size: string) => void;
  infoOpen: boolean;
  setInfoOpen: (open: boolean) => void;
  customDraft: { w: string; h: string } | null;
  setCustomDraft: (draft: { w: string; h: string } | null) => void;
}

const LAST_CUSTOM_SIZE_KEY = "gpt-edit:last-custom-size";

function readLastCustom(): { w: number; h: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_CUSTOM_SIZE_KEY);
    if (!raw) return null;
    const parsed = parseSize(raw);
    return parsed ?? null;
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

function Gpt2SizeControls({
  size,
  onChange,
  infoOpen,
  setInfoOpen,
  customDraft,
  setCustomDraft,
}: Gpt2SizeControlsProps) {
  const isPreset = (GPT_IMAGE_2_PRESETS as readonly string[]).includes(size);
  const dims = parseSize(size);
  const lastCustomRef = useRef<{ w: number; h: number } | null>(null);
  if (lastCustomRef.current === null) {
    lastCustomRef.current = readLastCustom();
  }
  const draftDims = customDraft
    ? {
        w: parseInt(customDraft.w, 10) || 0,
        h: parseInt(customDraft.h, 10) || 0,
      }
    : dims ?? { w: 1024, h: 1024 };

  // Mirror non-preset sizes (e.g. restored from saved project) into the remembered custom value.
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
    </fieldset>
  );
}
