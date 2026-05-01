"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import { ReferenceUploader } from "@/components/reference-uploader";
import { Gpt2SizeControls } from "@/components/gpt2-size-controls";
import { cn } from "@/lib/utils";
import {
  Project,
  VARIANT_COUNT,
  defaultProject,
  IMAGE_MODELS,
  IMAGE_MODEL_LABELS,
  GPT_IMAGE_15_SIZES,
  SUPPORTS_TRANSPARENT,
  aspectRatioForSize,
  sizeLabel,
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">GPT Edit</h1>
          <Link
            href="/editor"
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            Open editor →
          </Link>
        </div>

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
              <Gpt2SizeControls size={project.size} onChange={updateSize} />
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

          <ReferenceUploader
            references={project.referenceImages}
            onProjectUpdate={setProject}
            disabled={anyGenerating}
          />

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
