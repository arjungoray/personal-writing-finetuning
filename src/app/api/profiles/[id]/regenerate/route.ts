import { NextResponse } from "next/server";
import { z } from "zod";
import { regenerateProfileSection } from "@/lib/profiles/store";

const RequestSchema = z.object({
  section: z.enum(["analytic", "coachingRules"]),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { section } = RequestSchema.parse(await request.json());
  return NextResponse.json(await regenerateProfileSection(id, section));
}
