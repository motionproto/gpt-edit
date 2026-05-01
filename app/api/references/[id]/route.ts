import { NextResponse } from "next/server";
import { loadProject, saveProject, deleteReferenceImage } from "@/lib/storage";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await loadProject();
    const next = project.referenceImages.filter((r) => r.id !== id);
    if (next.length === project.referenceImages.length) {
      return NextResponse.json({ error: "Reference not found" }, { status: 404 });
    }
    project.referenceImages = next;
    await saveProject(project);
    await deleteReferenceImage(id);
    return NextResponse.json({ project });
  } catch (error) {
    console.error("Failed to delete reference:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 500 }
    );
  }
}
