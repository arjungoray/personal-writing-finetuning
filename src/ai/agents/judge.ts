import { parseJsonFromText } from "@/ai/mastra/json";
import { generateGeminiText } from "@/ai/mastra/provider";
import type { Settings } from "@/lib/store/settings";

export type JudgeRecord = {
  style_similarity: number;
  instruction_following: number;
  task_fulfillment: number;
  format_quality: number;
  final_score: number;
  reward: number;
  violations: string[];
  positive_style_evidence: string[];
  negative_style_evidence: string[];
  brief_rationale: string;
};

export async function judgeCompletionWithMastra(params: {
  settings: Settings;
  promptText: string;
  completionText: string;
  styleProfile: unknown;
  deterministicEvidence: unknown;
}): Promise<JudgeRecord> {
  if (params.settings.mockMode) {
    return {
      style_similarity: 75,
      instruction_following: 80,
      task_fulfillment: 80,
      format_quality: 80,
      final_score: 77,
      reward: 0.54,
      violations: [],
      positive_style_evidence: ["mock style match"],
      negative_style_evidence: [],
      brief_rationale: "Mock judgment.",
    };
  }

  const response = await generateGeminiText({
    settings: params.settings,
    model: params.settings.judgeModel,
    system: "You are an LLM judge. Return strict JSON matching the requested schema.",
    prompt: JSON.stringify({
      promptText: params.promptText,
      completionText: params.completionText,
      styleProfile: params.styleProfile,
      deterministicEvidence: params.deterministicEvidence,
      scoring: "0-100 scores; final_score = 0.60 style + 0.25 instruction + 0.15 task. reward = final_score / 50 - 1.",
      requiredShape: {
        style_similarity: 0,
        instruction_following: 0,
        task_fulfillment: 0,
        format_quality: 0,
        final_score: 0,
        reward: 0,
        violations: [],
        positive_style_evidence: [],
        negative_style_evidence: [],
        brief_rationale: "",
      },
    }),
  });
  return parseJsonFromText<JudgeRecord>(response.text);
}
