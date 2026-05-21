import { NextResponse } from "next/server";
import { GenerateProfileRequestSchema, generateProfile, listProfiles } from "@/lib/profiles/store";

export async function GET() {
  return NextResponse.json({ profiles: await listProfiles() });
}

export async function POST(request: Request) {
  const input = GenerateProfileRequestSchema.parse(await request.json());
  return NextResponse.json(await generateProfile(input), { status: 201 });
}
