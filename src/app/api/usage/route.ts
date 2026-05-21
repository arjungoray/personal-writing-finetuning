import { NextResponse } from "next/server";
import { summarizeAiUsage } from "@/lib/usage/store";

export async function GET() {
  return NextResponse.json(await summarizeAiUsage());
}
