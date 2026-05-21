import { NextResponse } from "next/server";
import { listRunEvents } from "@/lib/runs/store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json({ events: await listRunEvents(id) });
}
