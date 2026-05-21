import { NextResponse } from "next/server";
import { WritingInputSchema, createWritingRecord, listWritingRecords } from "@/lib/writings/store";

export async function GET() {
  return NextResponse.json({ writings: await listWritingRecords() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const input = WritingInputSchema.parse(body);
  const writing = await createWritingRecord(input);
  return NextResponse.json(writing, { status: 201 });
}
