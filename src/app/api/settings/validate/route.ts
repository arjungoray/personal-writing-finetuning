import { NextResponse } from "next/server";
import { validateAiSettings } from "@/ai/mastra/provider";
import { readSettings } from "@/lib/store/settings";

export async function POST() {
  const settings = await readSettings();
  if (settings.mockMode) {
    return NextResponse.json({
      ok: true,
      mockMode: true,
      generatorModel: settings.generatorModel,
      judgeModel: settings.judgeModel,
      message: "Mock mode is enabled; live Groq validation skipped.",
    });
  }

  return NextResponse.json({
    ...(await validateAiSettings(settings)),
    mockMode: false,
  });
}
