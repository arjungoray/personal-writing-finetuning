import { NextResponse } from "next/server";
import { readProfile, updateProfile } from "@/lib/profiles/store";
import { StyleProfileSchema } from "@/lib/profiles/types";

const UpdateProfileSchema = StyleProfileSchema.pick({
  analytic: true,
  coachingRules: true,
  userDirectives: true,
}).partial();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await readProfile(id));
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const patch = UpdateProfileSchema.parse(body);
  return NextResponse.json(await updateProfile(id, patch));
}
