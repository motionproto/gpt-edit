"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LightboxData } from "@/components/lightbox";

interface ImageSlotProps {
  imagePath?: string;  // Only provided if image exists
  previewPath?: string;
  index: number;
  isSelected: boolean;
  hasAnySelection: boolean;
  isGenerating: boolean;
  isEditing: boolean;
  isManuallyAdded?: boolean;
  aspectRatio?: "1:1" | "3:2" | "2:1"; // Default is 1:1 for icons, 2:1 for scenes
  onRegenerate: () => void;
  onSelect: () => void;
  onEdit: () => void;
  onAcceptEdit: () => void;
  onDiscardEdit: () => void;
  onPaste?: (imageBase64: string) => void;
  onImageDoubleClick?: (data: LightboxData) => void;
  onShowInFinder?: () => void;
}

export function ImageSlot({
  imagePath,
  previewPath,
  index,
  isSelected,
  hasAnySelection,
  isGenerating,
  isEditing,
  isManuallyAdded,
  aspectRatio = "1:1",
  onRegenerate,
  onSelect,
  onEdit,
  onAcceptEdit,
  onDiscardEdit,
  onPaste,
  onImageDoubleClick,
  onShowInFinder,
}: ImageSlotProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [showingPreview, setShowingPreview] = useState(true);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset loaded state when path changes (includes cache buster)
  useEffect(() => {
    setImageLoaded(false);
  }, [imagePath]);

  useEffect(() => {
    setPreviewLoaded(false);
    setShowingPreview(true); // Reset to showing preview when new preview comes in
  }, [previewPath]);

  // Handle paste events when focused
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!isFocused || !onPaste) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            onPaste(base64);
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [isFocused, onPaste]);

  const hasPreview = !!previewPath && previewLoaded;
  const hasImage = imageLoaded && !isGenerating && !isEditing;
  const isBusy = isGenerating || isEditing;

  // In preview mode, toggle between original and preview
  const showPreviewImage = hasPreview && showingPreview;

  const handleDoubleClick = () => {
    if (!onImageDoubleClick) return;
    if (!imagePath) return; // No image to show
    if (!hasImage && !hasPreview) return;

    onImageDoubleClick({
      imagePath,
      previewPath: hasPreview ? previewPath : undefined,
      onEdit: hasImage && !hasPreview ? onEdit : undefined,
      onAcceptEdit: hasPreview ? onAcceptEdit : undefined,
      onDiscardEdit: hasPreview ? onDiscardEdit : undefined,
    });
  };

  return (
    <div className="flex flex-col">
      <div
        ref={containerRef}
        tabIndex={0}
        onClick={hasImage && !hasPreview ? onSelect : undefined}
        onDoubleClick={handleDoubleClick}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={cn(
          "w-full bg-neutral-800 flex items-center justify-center overflow-hidden rounded outline-none",
          aspectRatio === "3:2" ? "aspect-[3/2]" : aspectRatio === "2:1" ? "aspect-[2/1]" : "aspect-square",
          hasImage && !hasPreview && "cursor-pointer",
          hasPreview
            ? showPreviewImage
              ? "border-4 border-amber-500 ring-2 ring-amber-500"
              : "border-4 border-gray-500 ring-2 ring-gray-500"
            : isSelected
              ? "border-4 border-blue-500 ring-2 ring-blue-500"
              : isFocused
                ? "border-2 border-green-400 ring-2 ring-green-400"
                : "border-2 border-gray-300",
          hasAnySelection && !isSelected && !hasPreview && "opacity-50",
          isBusy && "animate-pulse"
        )}
      >
        {isBusy ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            <div className="text-gray-500 text-sm">{isEditing ? "Editing..." : "Generating..."}</div>
          </div>
        ) : (
          <>
            {/* Original image - only try to load if imagePath is provided */}
            {imagePath && (
              <img
                src={imagePath}
                alt={`Variant ${index + 1}`}
                className={cn("w-full h-full object-contain", (!imageLoaded || showPreviewImage) && "hidden")}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageLoaded(false)}
              />
            )}
            {/* Preview image */}
            {previewPath && (
              <img
                src={previewPath}
                alt={`Preview ${index + 1}`}
                className={cn("w-full h-full object-contain", (!previewLoaded || !showPreviewImage) && "hidden")}
                onLoad={() => setPreviewLoaded(true)}
                onError={() => setPreviewLoaded(false)}
              />
            )}
            {!imageLoaded && !previewPath && (
              <div className="text-gray-400 text-sm text-center">
                {isFocused && onPaste ? (
                  <span className="text-green-400">Paste image (Ctrl/Cmd+V)</span>
                ) : (
                  <>Image {index + 1}</>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {isManuallyAdded && hasImage && !hasPreview && (
        <div className="text-center text-xs text-amber-400 mt-1">manually added</div>
      )}
      {hasPreview ? (
        <div className="flex justify-between mt-2 gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onDiscardEdit}
            className="text-xs px-2 h-7 text-red-400 hover:text-red-300"
          >
            undo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowingPreview(!showingPreview)}
            className="text-xs px-2 h-7 text-amber-400 hover:text-amber-300"
          >
            swap
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onAcceptEdit}
            className="text-xs px-2 h-7 text-green-400 hover:text-green-300"
          >
            accept
          </Button>
        </div>
      ) : (
        <div className="flex justify-between mt-2 gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={isBusy}
            className="text-xs px-2 h-7"
          >
            generate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={isBusy || !imageLoaded}
            className="text-xs px-2 h-7"
          >
            edit
          </Button>
          {onShowInFinder && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onShowInFinder}
              disabled={!hasImage}
              className="text-xs px-2 h-7"
            >
              show
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelect}
            disabled={isBusy || !hasImage}
            className={cn("text-xs px-2 h-7", isSelected && "text-blue-400 font-medium")}
          >
            {isSelected ? "selected" : "select"}
          </Button>
        </div>
      )}
    </div>
  );
}
