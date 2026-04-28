"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LightboxData {
  imagePath: string;
  previewPath?: string;
  onEdit?: () => void;
  onAcceptEdit?: () => void;
  onDiscardEdit?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  label?: string;
}

interface LightboxProps {
  data: LightboxData | null;
  onClose: () => void;
}

export function Lightbox({ data, onClose }: LightboxProps) {
  const [showingPreview, setShowingPreview] = useState(true);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && data?.onPrev) {
        e.preventDefault();
        data.onPrev();
      } else if (e.key === "ArrowRight" && data?.onNext) {
        e.preventDefault();
        data.onNext();
      }
    },
    [data, onClose]
  );

  useEffect(() => {
    if (data) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      setShowingPreview(true);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [data, handleKeyDown]);

  if (!data) return null;

  const hasPreview = !!data.previewPath;
  const currentImage = hasPreview && showingPreview ? data.previewPath : data.imagePath;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="shrink-0 h-12 flex items-center justify-center relative">
        {data.label && (
          <span className="text-white text-lg font-medium">{data.label}</span>
        )}
        {hasPreview && (
          <span className={cn(
            "ml-3 px-2 py-0.5 rounded text-sm font-medium",
            showingPreview ? "bg-amber-500/30 text-amber-300" : "bg-gray-500/30 text-gray-300"
          )}>
            {showingPreview ? "Edited" : "Original"}
          </span>
        )}
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10"
        >
          <X size={24} />
        </button>
      </div>

      {/* Main content - image fills remaining space */}
      <div className="flex-1 flex items-center min-h-0 px-2 pb-2">
        {/* Previous arrow */}
        <button
          onClick={() => data.onPrev?.()}
          disabled={!data.onPrev}
          className={cn(
            "shrink-0 w-16 h-full flex items-center justify-center text-6xl font-light",
            data.onPrev
              ? "text-white/60 hover:text-white"
              : "text-neutral-800"
          )}
        >
          ‹
        </button>

        {/* Image container with backdrop */}
        <div className={cn(
          "flex-1 h-full flex items-center justify-center rounded-lg border-4 bg-neutral-900",
          hasPreview
            ? showingPreview ? "border-amber-500" : "border-gray-500"
            : "border-neutral-700"
        )}>
          <img
            src={currentImage}
            alt="Lightbox view"
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* Next arrow */}
        <button
          onClick={() => data.onNext?.()}
          disabled={!data.onNext}
          className={cn(
            "shrink-0 w-16 h-full flex items-center justify-center text-6xl font-light",
            data.onNext
              ? "text-white/60 hover:text-white"
              : "text-neutral-800"
          )}
        >
          ›
        </button>
      </div>

      {/* Footer with action buttons */}
      <div className="shrink-0 h-14 flex items-center justify-center gap-3">
        {hasPreview ? (
          <>
            <Button
              variant="outline"
              onClick={() => data.onDiscardEdit?.()}
              className="bg-red-500/20 border-red-500 text-red-400 hover:bg-red-500/30 hover:text-red-300"
            >
              Undo Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowingPreview(!showingPreview)}
              className="bg-amber-500/20 border-amber-500 text-amber-400 hover:bg-amber-500/30 hover:text-amber-300"
            >
              {showingPreview ? "Show Original" : "Show Edited"}
            </Button>
            <Button
              variant="outline"
              onClick={() => data.onAcceptEdit?.()}
              className="bg-green-500/20 border-green-500 text-green-400 hover:bg-green-500/30 hover:text-green-300"
            >
              Accept Edit
            </Button>
          </>
        ) : data.onEdit ? (
          <Button
            variant="outline"
            onClick={() => { data.onEdit?.(); onClose(); }}
            className="bg-blue-500/20 border-blue-500 text-blue-400 hover:bg-blue-500/30 hover:text-blue-300"
          >
            Edit Image
          </Button>
        ) : null}
      </div>
    </div>
  );
}
