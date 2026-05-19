import { NextResponse } from "next/server";
import { StartRunRequestSchema, listRuns, startRun } from "@/lib/runs/store";

export async function GET() {
  return NextResponse.json({ runs: await listRuns() });
}

export async function POST(request: Request) {
  const input = StartRunRequestSchema.parse(await request.json());
  return NextResponse.json(await startRun(input), { status: 201 });
}
