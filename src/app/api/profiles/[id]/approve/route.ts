import { NextResponse } from "next/server";
import { approveProfile } from "@/lib/profiles/store";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await approveProfile(id));
}
