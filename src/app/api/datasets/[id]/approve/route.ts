import { NextResponse } from "next/server";
import { approveDataset } from "@/lib/datasets/store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await approveDataset(id));
}
