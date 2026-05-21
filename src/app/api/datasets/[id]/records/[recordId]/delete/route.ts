import { NextResponse } from "next/server";
import { deleteDatasetRecord } from "@/lib/datasets/store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const { id, recordId } = await params;
  return NextResponse.json(await deleteDatasetRecord(id, recordId));
}
