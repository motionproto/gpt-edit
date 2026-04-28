import { promises as fs } from "fs";
import path from "path";
import { Project, defaultProject } from "./types";

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
    return { ...defaultProject, ...project };
  } catch {
    return defaultProject;
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
