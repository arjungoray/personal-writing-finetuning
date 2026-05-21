import { NextResponse } from "next/server";
import { exportRunBundle } from "@/lib/runs/export";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await exportRunBundle(id));
}
