"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
import { PromptImageSlot } from "@/components/prompt-image-slot";
import { PromptScaleButtons } from "@/components/prompt-scale-buttons";
import { MaskEditor } from "@/components/mask-editor";
import {
  buildPreserveEdgesMaskPng,
  resolvePreserveEdgesMaskBase64,
} from "@/lib/mask";
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
  formatSize,
  predictAutoOutput,
  sizeLabel,
  validateSizeForModel,
  ImageModel,
} from "@/lib/types";
import { estimateJobCost, formatCost } from "@/lib/cost";
import {
  OversizeInputsWarning,
  findOversizeInputs,
} from "@/components/oversize-inputs-warning";

function autoSizeFor(
  dims: { w: number; h: number },
  model: ImageModel
): string {
  if (model === "gpt-image-1.5") {
    const ratio = dims.w / dims.h;
    const candidates: { size: string; r: number }[] = [
      { size: "1024x1024", r: 1 },
      { size: "1536x1024", r: 1.5 },
      { size: "1024x1536", r: 1 / 1.5 },
    ];
    return candidates.reduce((best, c) =>
      Math.abs(Math.log(ratio) - Math.log(c.r)) <
      Math.abs(Math.log(ratio) - Math.log(best.r))
        ? c
        : best
    ).size;
  }
  const fit = predictAutoOutput(dims.w, dims.h);
  return formatSize(fit.w, fit.h);
}

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
  const [promptImageDims, setPromptImageDims] = useState<{ w: number; h: number } | null>(null);
  const [maskEditorOpen, setMaskEditorOpen] = useState(false);

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
    next: Partial<Pick<Project, "prompt" | "transparent" | "preserveEdges" | "size" | "model">>
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

    let maskBase64: string | undefined;
    if (project.preserveEdges && project.promptImage) {
      try {
        maskBase64 = await resolvePreserveEdgesMaskBase64({
          promptImageUrl: `/api/images/${project.promptImage.filename}`,
          customMaskUrl: project.promptMask
            ? `/api/images/${project.promptMask.filename}`
            : null,
        });
      } catch (e) {
        console.error("Failed to build preserve-edges mask:", e);
      }
    }

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
          ...(maskBase64 ? { maskBase64 } : {}),
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

    let maskBase64: string | undefined;
    if (project.preserveEdges) {
      try {
        maskBase64 = await buildPreserveEdgesMaskPng(
          `/api/images/variant-${target}.png?v=${imageVersions[target] || 0}`
        );
      } catch (e) {
        console.error("Failed to build preserve-edges mask:", e);
      }
    }

    try {
      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantIndex: target,
          editPrompt: editPrompt.trim(),
          ...(maskBase64 ? { maskBase64 } : {}),
        }),
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

  const updatePreserveEdges = (value: boolean) => {
    setProject((prev) => ({ ...prev, preserveEdges: value }));
    persistProject({ preserveEdges: value });
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

  const handlePromptImageUploaded = (dims: { w: number; h: number }) => {
    setPromptImageDims(dims);
    const next = autoSizeFor(dims, project.model);
    if (next !== project.size) updateSize(next);
  };

  // Real dims persisted on upload + backfilled at load. If anything's missing
  // we surface "(partial)" instead of guessing.
  const inputImageBuild = useMemo(() => {
    const dims: { w: number; h: number }[] = [];
    let unknown = 0;
    const consider = (img: { width?: number; height?: number } | null) => {
      if (!img) return;
      if (img.width && img.height) dims.push({ w: img.width, h: img.height });
      else unknown += 1;
    };
    consider(project.promptImage);
    project.referenceImages.forEach((r) => consider(r));
    return { dims, unknown };
  }, [project.promptImage, project.referenceImages]);

  // Effective source for size="auto" — prefer persisted prompt-image dims,
  // fall back to the in-session value if persistence is mid-flight.
  const autoSource = useMemo(() => {
    if (project.promptImage?.width && project.promptImage.height) {
      return { w: project.promptImage.width, h: project.promptImage.height };
    }
    return promptImageDims ?? undefined;
  }, [project.promptImage, promptImageDims]);

  const generateEstimate = useMemo(
    () =>
      estimateJobCost({
        prompt: project.prompt,
        size: project.size,
        model: project.model,
        variantCount: VARIANT_COUNT,
        inputImageDims: inputImageBuild.dims,
        unknownInputCount: inputImageBuild.unknown,
        autoSourceDims: autoSource,
      }),
    [project.prompt, project.size, project.model, inputImageBuild, autoSource]
  );

  const editEstimate = useMemo(() => {
    if (editDialogIndex === null) return null;
    // The variant being edited is itself an input image, sized to project.size
    // (or to the predicted output when "auto").
    const parsed = project.size.match(/^(\d+)x(\d+)$/);
    const variantDims = parsed
      ? { w: parseInt(parsed[1], 10), h: parseInt(parsed[2], 10) }
      : (generateEstimate.predictedOutput ?? null);
    const dims = variantDims
      ? [variantDims, ...inputImageBuild.dims]
      : inputImageBuild.dims;
    return estimateJobCost({
      prompt: editPrompt,
      size: project.size,
      model: project.model,
      variantCount: 1,
      inputImageDims: dims,
      unknownInputCount: inputImageBuild.unknown + (variantDims ? 0 : 1),
      autoSourceDims: autoSource,
    });
  }, [
    editDialogIndex,
    editPrompt,
    project.size,
    project.model,
    inputImageBuild,
    autoSource,
    generateEstimate.predictedOutput,
  ]);

  const oversizeItems = useMemo(
    () =>
      findOversizeInputs(
        project.promptImage,
        project.referenceImages,
        generateEstimate.predictedOutput
      ),
    [project.promptImage, project.referenceImages, generateEstimate.predictedOutput]
  );

  const estimateTooltip = (e: ReturnType<typeof estimateJobCost>) =>
    `Input ~${formatCost(e.inputCost)} (${e.textTokens.toLocaleString()} text + ${e.inputImageTokens.toLocaleString()} image tokens)\nOutput ~${formatCost(e.outputCost)} (${e.outputImageTokens.toLocaleString()} tokens, approx)${e.partial ? "\nSome inputs missing dims — estimate is partial." : ""}\nOutput is an estimate; actual usage may vary.`;

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

            <div className="flex items-center gap-3 pb-1">
              <label
                className={cn(
                  "flex items-center gap-2 text-sm select-none",
                  project.promptImage
                    ? "text-gray-300 cursor-pointer"
                    : "text-gray-500 cursor-not-allowed"
                )}
                title={
                  project.promptImage
                    ? "Locks the source image's outer silhouette via the API mask. The model can only repaint interior pixels — useful for editing a cut-out you want to paste back."
                    : "Add a prompt image to enable edge preservation."
                }
              >
                <input
                  type="checkbox"
                  checked={project.preserveEdges && !!project.promptImage}
                  disabled={!project.promptImage}
                  onChange={(e) => updatePreserveEdges(e.target.checked)}
                  className="h-4 w-4 accent-blue-500"
                />
                Preserve edges
              </label>
              <button
                type="button"
                onClick={() => setMaskEditorOpen(true)}
                disabled={!project.promptImage}
                className={cn(
                  "text-xs underline disabled:no-underline",
                  project.promptImage
                    ? "text-blue-400 hover:text-blue-300"
                    : "text-gray-600 cursor-not-allowed"
                )}
              >
                {project.promptMask ? "Edit mask (custom)" : "Edit mask"}
              </button>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex flex-col gap-2">
              <PromptImageSlot
                promptImage={project.promptImage}
                onProjectUpdate={setProject}
                onDims={setPromptImageDims}
                onUploaded={handlePromptImageUploaded}
                disabled={anyGenerating}
              />
              {project.promptImage &&
                promptImageDims &&
                project.model === "gpt-image-2" &&
                !project.preserveEdges && (
                  <PromptScaleButtons
                    source={promptImageDims}
                    currentSize={project.size}
                    onChange={updateSize}
                    disabled={anyGenerating}
                  />
                )}
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 block mb-1">Prompt</label>
              <Textarea
                value={project.prompt}
                onChange={(e) => updatePrompt(e.target.value)}
                onBlur={handlePromptBlur}
                placeholder="Describe the image you want to generate..."
                className="min-h-[128px] bg-neutral-800 text-gray-200 border-neutral-700"
              />
            </div>
          </div>

          <ReferenceUploader
            references={project.referenceImages}
            onProjectUpdate={setProject}
            disabled={anyGenerating}
          />

          <OversizeInputsWarning
            items={oversizeItems}
            variantCount={VARIANT_COUNT}
            onProjectUpdate={setProject}
            disabled={anyGenerating}
          />

          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-400">
              {project.images.filter(Boolean).length} of {VARIANT_COUNT} variations generated
            </div>
            <div className="flex items-center gap-3">
              <span
                className="text-xs text-gray-400 cursor-help"
                title={estimateTooltip(generateEstimate)}
              >
                Est. ~{formatCost(generateEstimate.totalCost)} ({VARIANT_COUNT} variants)
                {generateEstimate.partial ? "*" : ""}
              </span>
              <Button
                onClick={() => generate()}
                disabled={anyGenerating || promptIsEmpty}
              >
                {anyGenerating ? "Generating..." : "Generate All"}
              </Button>
            </div>
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
          <DialogFooter className="sm:justify-between">
            {editEstimate ? (
              <span
                className="text-xs text-gray-400 cursor-help self-center"
                title={estimateTooltip(editEstimate)}
              >
                Est. ~{formatCost(editEstimate.totalCost)}
                {editEstimate.partial ? "*" : ""}
              </span>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditDialogIndex(null)}>
                Cancel
              </Button>
              <Button onClick={submitEdit} disabled={!editPrompt.trim()}>
                Apply Edit
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Lightbox data={lightboxData} onClose={() => setLightboxData(null)} />

      <MaskEditor
        open={maskEditorOpen}
        promptImageUrl={
          project.promptImage
            ? `/api/images/${project.promptImage.filename}`
            : null
        }
        customMaskUrl={
          project.promptMask
            ? `/api/images/${project.promptMask.filename}`
            : null
        }
        onSaved={(p) => setProject(p as Project)}
        onClose={() => setMaskEditorOpen(false)}
      />
    </main>
  );
}
