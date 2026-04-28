import { NextResponse } from "next/server";
import { loadProject, saveProject } from "@/lib/storage";

export async function GET() {
  const project = await loadProject();
  return NextResponse.json(project);
}

export async function PUT(request: Request) {
  const body = await request.json();
  const project = await loadProject();
  const updated = {
    ...project,
    ...(typeof body.prompt === "string" ? { prompt: body.prompt } : {}),
    ...(typeof body.transparent === "boolean" ? { transparent: body.transparent } : {}),
  };
  await saveProject(updated);
  return NextResponse.json(updated);
}
