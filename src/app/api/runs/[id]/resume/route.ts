import { NextResponse } from "next/server";
import { resumeRun } from "@/lib/runs/store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await resumeRun(id));
}
