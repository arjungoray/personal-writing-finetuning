import { z } from "zod";
import { NextResponse } from "next/server";
import { judgeCompletionWithMastra } from "@/ai/agents/judge";
import { readSettings } from "@/lib/store/settings";

const JudgeRequestSchema = z.object({
  promptText: z.string(),
  completionText: z.string(),
  styleProfile: z.unknown().optional(),
  deterministicEvidence: z.unknown().optional(),
});

export async function POST(request: Request) {
  const input = JudgeRequestSchema.parse(await request.json());
  const settings = await readSettings();
  return NextResponse.json(await judgeCompletionWithMastra({
    settings,
    promptText: input.promptText,
    completionText: input.completionText,
    styleProfile: input.styleProfile ?? {},
    deterministicEvidence: input.deterministicEvidence ?? {},
  }));
}
