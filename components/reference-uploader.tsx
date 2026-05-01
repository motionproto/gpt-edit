"use client";

import { useRef, useState } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const atCap = references.length >= MAX_REFERENCES;

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const file of list) {
        if (references.length + 1 > MAX_REFERENCES) break;
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/references", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(`Upload failed: ${data.error || res.statusText}`);
          continue;
        }
        const data = await res.json();
        if (data.project) onProjectUpdate(data.project);
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    const res = await fetch(`/api/references/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(`Remove failed: ${data.error || res.statusText}`);
      return;
    }
    const data = await res.json();
    if (data.project) onProjectUpdate(data.project);
  };

  return (
    <div>
      <label className="text-xs text-gray-400 block mb-1">
        Reference images ({references.length}/{MAX_REFERENCES})
      </label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !atCap) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled || atCap) return;
          if (e.dataTransfer.files.length > 0) upload(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-wrap gap-2 p-2 rounded border border-dashed",
          dragOver
            ? "border-blue-500 bg-blue-500/5"
            : "border-neutral-700 bg-neutral-900/40"
        )}
      >
        {references.map((ref) => (
          <div
            key={ref.id}
            className="relative w-20 h-20 rounded overflow-hidden bg-neutral-800 border border-neutral-700"
          >
            <img
              src={`/api/images/${ref.filename}`}
              alt="reference"
              className="w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={() => remove(ref.id)}
              disabled={disabled}
              className="absolute top-0.5 right-0.5 bg-black/70 rounded-full p-0.5 text-white hover:bg-black"
              aria-label="Remove reference"
            >
              <X size={12} />
            </button>
          </div>
        ))}

        {!atCap && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || uploading}
            className={cn(
              "w-20 h-20 rounded flex flex-col items-center justify-center text-xs gap-1",
              "border border-neutral-700 bg-neutral-800 text-gray-400",
              "hover:bg-neutral-700 hover:text-gray-200 disabled:opacity-50"
            )}
          >
            <Plus size={18} />
            {uploading ? "..." : "Add"}
          </button>
        )}

        {references.length === 0 && (
          <span className="text-xs text-gray-500 self-center px-1">
            Drop images here or click Add. They guide every variant generation.
          </span>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
      </div>
    </div>
  );
}
