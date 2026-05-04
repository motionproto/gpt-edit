"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project, ReferenceImage } from "@/lib/types";
import { MAX_REFERENCES } from "@/lib/types";

interface ReferenceUploaderProps {
  references: ReferenceImage[];
  onProjectUpdate: (project: Project) => void;
  disabled?: boolean;
}

export function ReferenceUploader({
  references,
  onProjectUpdate,
  disabled,
}: ReferenceUploaderProps) {
  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">
        Reference images ({references.length}/{MAX_REFERENCES})
      </label>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: MAX_REFERENCES }, (_, i) => i).map((i) => (
          <ReferenceSlot
            key={references[i]?.id ?? `empty-${i}`}
            slotIndex={i}
            reference={references[i] ?? null}
            disabled={disabled}
            onProjectUpdate={onProjectUpdate}
          />
        ))}
      </div>
    </div>
  );
}

interface ReferenceSlotProps {
  slotIndex: number;
  reference: ReferenceImage | null;
  disabled?: boolean;
  onProjectUpdate: (project: Project) => void;
}

function ReferenceSlot({
  slotIndex,
  reference,
  disabled,
  onProjectUpdate,
}: ReferenceSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const filled = !!reference;

  const addNew = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/references", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Upload failed: ${data.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.project) onProjectUpdate(data.project);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const replace = async (file: File) => {
    if (!reference) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/references/${reference.id}`, {
        method: "PUT",
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Replace failed: ${data.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      if (data.project) onProjectUpdate(data.project);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    if (!reference) return;
    const res = await fetch(`/api/references/${reference.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Remove failed: ${data.error || res.statusText}`);
      return;
    }
    const data = await res.json();
    if (data.project) onProjectUpdate(data.project);
  };

  const handleFile = (file: File) => {
    if (filled) void replace(file);
    else void addNew(file);
  };

  // Paste-when-focused: routes to this specific slot.
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
          handleFile(file);
          return;
        }
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, filled, reference?.id]);

  return (
    <div
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
        if (file) handleFile(file);
      }}
      aria-label={
        filled
          ? `Reference slot ${slotIndex + 1} (filled)`
          : `Reference slot ${slotIndex + 1} (empty)`
      }
      className={cn(
        "relative w-20 h-20 rounded overflow-hidden bg-neutral-800 outline-none",
        dragOver
          ? "border-2 border-blue-500"
          : isFocused
            ? "border-2 border-green-400"
            : filled
              ? "border border-neutral-700"
              : "border border-dashed border-neutral-700"
      )}
    >
      {filled ? (
        <img
          src={`/api/images/${reference!.filename}`}
          alt={`Reference ${slotIndex + 1}`}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500 px-1 text-center leading-tight">
          {uploading ? "..." : isFocused ? <span className="text-green-400">paste</span> : null}
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        disabled={disabled || uploading}
        aria-label={filled ? "Replace reference image" : "Add reference image"}
        title={filled ? "Replace reference image" : "Add reference image"}
        className={cn(
          "absolute bottom-1 right-1 rounded-full p-1",
          "bg-black/70 text-white hover:bg-black",
          "disabled:opacity-50"
        )}
      >
        <Plus size={12} />
      </button>

      {filled && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void remove();
          }}
          disabled={disabled}
          aria-label="Remove reference image"
          className="absolute top-0.5 right-0.5 bg-black/70 rounded-full p-0.5 text-white hover:bg-black"
        >
          <X size={10} />
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}
