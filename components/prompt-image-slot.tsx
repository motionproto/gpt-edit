"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project, ReferenceImage } from "@/lib/types";
import { ImageCostBadge } from "@/components/image-cost-badge";

interface PromptImageSlotProps {
  promptImage: ReferenceImage | null;
  onProjectUpdate: (project: Project) => void;
  onDims?: (dims: { w: number; h: number } | null) => void;
  onUploaded?: (dims: { w: number; h: number }) => void;
  disabled?: boolean;
  outputDims?: { w: number; h: number } | null;
  variantCount?: number;
}

async function readImageDimsFromFile(file: File): Promise<{ w: number; h: number }> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("Failed to read image dimensions"));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PromptImageSlot({
  promptImage,
  onProjectUpdate,
  onDims,
  onUploaded,
  disabled,
  outputDims,
  variantCount = 1,
}: PromptImageSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      let dims: { w: number; h: number } | null = null;
      try {
        dims = await readImageDimsFromFile(file);
      } catch {
        // dims read failure isn't fatal — proceed without auto-size
      }

      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/prompt-image", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Upload failed: ${data.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.project) onProjectUpdate(data.project);
      if (dims) onUploaded?.(dims);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    const res = await fetch("/api/prompt-image", { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Remove failed: ${data.error || res.statusText}`);
      return;
    }
    const data = await res.json();
    if (data.project) onProjectUpdate(data.project);
    onDims?.(null);
  };

  // Paste handler — only fires when this slot is focused.
  useEffect(() => {
    if (!isFocused) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (!file) continue;
          e.preventDefault();
          void upload(file);
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const hasImage = !!promptImage;

  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">Prompt image</label>
      <div
        ref={containerRef}
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        className={cn(
          "relative w-32 h-32 rounded overflow-hidden bg-neutral-800 outline-none",
          dragOver
            ? "border-2 border-blue-500"
            : isFocused
              ? "border-2 border-green-400"
              : hasImage
                ? "border border-neutral-700"
                : "border border-dashed border-neutral-700"
        )}
      >
        {hasImage ? (
          <img
            src={`/api/images/${promptImage!.filename}`}
            alt="Prompt image"
            className="w-full h-full object-cover"
            onLoad={(e) => {
              const el = e.currentTarget;
              onDims?.({ w: el.naturalWidth, h: el.naturalHeight });
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-500 px-2 text-center leading-snug">
            {uploading ? (
              "..."
            ) : isFocused ? (
              <span className="text-green-400">Paste, drop, or click +</span>
            ) : (
              "Drop, paste, or click +"
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          aria-label={hasImage ? "Replace prompt image" : "Add prompt image"}
          title={hasImage ? "Replace prompt image" : "Add prompt image"}
          className={cn(
            "absolute bottom-1 right-1 rounded-full p-1.5",
            "bg-black/70 text-white hover:bg-black",
            "disabled:opacity-50"
          )}
        >
          <Plus size={14} />
        </button>

        {hasImage && (
          <button
            type="button"
            onClick={remove}
            disabled={disabled}
            aria-label="Remove prompt image"
            className="absolute top-1 right-1 bg-black/70 rounded-full p-0.5 text-white hover:bg-black"
          >
            <X size={12} />
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {hasImage && (
        <div className="mt-1">
          <ImageCostBadge
            image={promptImage!}
            kind="promptImage"
            output={outputDims ?? null}
            variantCount={variantCount}
            onProjectUpdate={onProjectUpdate}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
