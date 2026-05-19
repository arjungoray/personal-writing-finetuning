import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import type { Settings } from "@/lib/store/settings";

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type AiTextResult = {
  text: string;
  usage: AiUsage;
  model: string;
};

function requireGeminiKey() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for live Gemini jobs.");
  }
}

function normalizeUsage(usage: unknown): AiUsage {
  const value = usage && typeof usage === "object" ? usage as Record<string, unknown> : {};
  const inputTokens = Number(value.inputTokens ?? value.promptTokens ?? 0);
  const outputTokens = Number(value.outputTokens ?? value.completionTokens ?? 0);
  const totalTokens = Number(value.totalTokens ?? inputTokens + outputTokens);
  return { inputTokens, outputTokens, totalTokens };
}

export async function generateGeminiText(params: {
  settings: Settings;
  model: string;
  system: string;
  prompt: string;
}): Promise<AiTextResult> {
  requireGeminiKey();
  const result = await generateText({
    model: google(params.model),
    system: params.system,
    prompt: params.prompt,
  });

  return {
    text: result.text,
    usage: normalizeUsage(result.usage),
    model: params.model,
  };
}

export async function validateGeminiSettings(settings: Settings) {
  requireGeminiKey();
  const result = await generateGeminiText({
    settings,
    model: settings.generatorModel,
    system: "You validate model connectivity. Reply with exactly OK.",
    prompt: "Reply with OK.",
  });
  return {
    ok: result.text.trim().toUpperCase().includes("OK"),
    generatorModel: settings.generatorModel,
    judgeModel: settings.judgeModel,
    usage: result.usage,
  };
}
