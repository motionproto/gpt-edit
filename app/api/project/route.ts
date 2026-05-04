import { NextResponse } from "next/server";
import { loadProject, saveProject } from "@/lib/storage";
import { IMAGE_MODELS, ImageModel, validateSizeForModel } from "@/lib/types";

export async function GET() {
  const project = await loadProject();
  return NextResponse.json(project);
}

export async function PUT(request: Request) {
  const body = await request.json();
  const project = await loadProject();

  const modelIsValid =
    typeof body.model === "string" && (IMAGE_MODELS as readonly string[]).includes(body.model);
  const targetModel: ImageModel = modelIsValid ? (body.model as ImageModel) : project.model;

  const sizeIsValid =
    typeof body.size === "string" &&
    validateSizeForModel(body.size, targetModel).valid;

  const updated = {
    ...project,
    ...(typeof body.prompt === "string" ? { prompt: body.prompt } : {}),
    ...(typeof body.transparent === "boolean" ? { transparent: body.transparent } : {}),
    ...(typeof body.preserveEdges === "boolean" ? { preserveEdges: body.preserveEdges } : {}),
    ...(sizeIsValid ? { size: body.size } : {}),
    ...(modelIsValid ? { model: body.model } : {}),
  };
  await saveProject(updated);
  return NextResponse.json(updated);
}
