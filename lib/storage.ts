import { promises as fs } from "fs";
import path from "path";
import { Project, defaultProject } from "./types";
import { readImageDimensions } from "./image-dims";

const DATA_DIR = path.join(process.cwd(), "data");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const PROJECT_FILE = path.join(DATA_DIR, "project.json");

export async function ensureDirectories() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });
}

export async function loadProject(): Promise<Project> {
  try {
    await ensureDirectories();
    const data = await fs.readFile(PROJECT_FILE, "utf-8");
    const project = JSON.parse(data) as Project;
    const merged: Project = {
      ...defaultProject,
      ...project,
      referenceImages: project.referenceImages ?? [],
      promptImage: project.promptImage ?? null,
      promptMask: project.promptMask ?? null,
      preserveEdges: project.preserveEdges ?? false,
    };

    let mutated = false;
    const backfilledRefs = await Promise.all(
      merged.referenceImages.map(async (ref) => {
        if (ref.width && ref.height) return ref;
        const dims = await readDimsFromFile(
          path.join(IMAGES_DIR, referenceFilename(ref.id))
        );
        if (!dims) return ref;
        mutated = true;
        return { ...ref, width: dims.w, height: dims.h };
      })
    );
    merged.referenceImages = backfilledRefs;

    if (
      merged.promptImage &&
      (!merged.promptImage.width || !merged.promptImage.height)
    ) {
      const dims = await readDimsFromFile(
        path.join(IMAGES_DIR, promptImageFilename(merged.promptImage.id))
      );
      if (dims) {
        mutated = true;
        merged.promptImage = {
          ...merged.promptImage,
          width: dims.w,
          height: dims.h,
        };
      }
    }

    if (mutated) await saveProject(merged);
    return merged;
  } catch {
    return defaultProject;
  }
}

async function readDimsFromFile(filePath: string) {
  try {
    const buf = await fs.readFile(filePath);
    return readImageDimensions(buf);
  } catch {
    return null;
  }
}

export async function saveProject(project: Project): Promise<void> {
  await ensureDirectories();
  await fs.writeFile(PROJECT_FILE, JSON.stringify(project, null, 2));
}

function variantFilename(variantIndex: number): string {
  return `variant-${variantIndex}.png`;
}

function previewFilename(variantIndex: number): string {
  return `variant-${variantIndex}-edit.png`;
}

export function referenceFilename(id: string): string {
  return `reference-${id}.png`;
}

export function getImageApiPath(variantIndex: number, version = 0): string {
  return `/api/images/${variantFilename(variantIndex)}?v=${version}`;
}

export function getPreviewApiPath(variantIndex: number, version = 0): string {
  return `/api/images/${previewFilename(variantIndex)}?v=${version}`;
}

export function getImageFilePath(filename: string): string {
  return path.join(IMAGES_DIR, filename);
}

export async function saveImage(variantIndex: number, imageData: Buffer): Promise<string> {
  await ensureDirectories();
  const filename = variantFilename(variantIndex);
  await fs.writeFile(path.join(IMAGES_DIR, filename), imageData);
  return filename;
}

export async function savePreviewImage(
  variantIndex: number,
  imageData: Buffer
): Promise<string> {
  await ensureDirectories();
  const filename = previewFilename(variantIndex);
  await fs.writeFile(path.join(IMAGES_DIR, filename), imageData);
  return filename;
}

export async function readImage(variantIndex: number): Promise<Buffer> {
  return fs.readFile(path.join(IMAGES_DIR, variantFilename(variantIndex)));
}

export async function acceptPreviewImage(variantIndex: number): Promise<void> {
  const previewPath = path.join(IMAGES_DIR, previewFilename(variantIndex));
  const originalPath = path.join(IMAGES_DIR, variantFilename(variantIndex));
  await fs.rename(previewPath, originalPath);
}

export async function discardPreviewImage(variantIndex: number): Promise<void> {
  const previewPath = path.join(IMAGES_DIR, previewFilename(variantIndex));
  try {
    await fs.unlink(previewPath);
  } catch {
    // Preview may not exist; that's fine.
  }
}

export async function saveReferenceImage(id: string, data: Buffer): Promise<string> {
  await ensureDirectories();
  const filename = referenceFilename(id);
  await fs.writeFile(path.join(IMAGES_DIR, filename), data);
  return filename;
}

export async function readReferenceImage(id: string): Promise<Buffer> {
  return fs.readFile(path.join(IMAGES_DIR, referenceFilename(id)));
}

export async function deleteReferenceImage(id: string): Promise<void> {
  try {
    await fs.unlink(path.join(IMAGES_DIR, referenceFilename(id)));
  } catch {
    // Already gone — fine.
  }
}

export function promptImageFilename(id: string): string {
  return `prompt-image-${id}.png`;
}

export async function savePromptImage(id: string, data: Buffer): Promise<string> {
  await ensureDirectories();
  const filename = promptImageFilename(id);
  await fs.writeFile(path.join(IMAGES_DIR, filename), data);
  return filename;
}

export async function readPromptImage(id: string): Promise<Buffer> {
  return fs.readFile(path.join(IMAGES_DIR, promptImageFilename(id)));
}

export async function deletePromptImage(id: string): Promise<void> {
  try {
    await fs.unlink(path.join(IMAGES_DIR, promptImageFilename(id)));
  } catch {
    // Already gone — fine.
  }
}

export function promptMaskFilename(id: string): string {
  return `prompt-mask-${id}.png`;
}

export async function savePromptMask(id: string, data: Buffer): Promise<string> {
  await ensureDirectories();
  const filename = promptMaskFilename(id);
  await fs.writeFile(path.join(IMAGES_DIR, filename), data);
  return filename;
}

export async function deletePromptMask(id: string): Promise<void> {
  try {
    await fs.unlink(path.join(IMAGES_DIR, promptMaskFilename(id)));
  } catch {
    // Already gone — fine.
  }
}
