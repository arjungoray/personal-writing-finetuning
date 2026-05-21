import { NextResponse } from "next/server";
import { deletePlaygroundResult } from "@/lib/playground/store";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await deletePlaygroundResult(id));
}
