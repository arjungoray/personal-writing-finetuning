import { NextResponse } from "next/server";
import { GenerateDatasetRequestSchema, generateDataset, listDatasets } from "@/lib/datasets/store";

export async function GET() {
  return NextResponse.json({ datasets: await listDatasets() });
}

export async function POST(request: Request) {
  const input = GenerateDatasetRequestSchema.parse(await request.json());
  return NextResponse.json(await generateDataset(input), { status: 201 });
}
