import { NextResponse } from "next/server";
import { listDatasetRecords } from "@/lib/datasets/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ records: await listDatasetRecords(id) });
}
