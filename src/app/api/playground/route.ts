import { NextResponse } from "next/server";
import { PlaygroundRequestSchema, createPlaygroundResult, listPlaygroundResults } from "@/lib/playground/store";

export async function GET() {
  return NextResponse.json({ results: await listPlaygroundResults() });
}

export async function POST(request: Request) {
  const input = PlaygroundRequestSchema.parse(await request.json());
  return NextResponse.json(await createPlaygroundResult(input), { status: 201 });
}
