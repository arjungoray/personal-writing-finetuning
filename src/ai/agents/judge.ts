import { parseJsonFromText } from "@/ai/mastra/json";
import { generateAiText } from "@/ai/mastra/provider";
import type { Settings } from "@/lib/store/settings";
import { z } from "zod";

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

const finiteNumber = z.preprocess((value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}, z.number());

const optionalFiniteNumber = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}, z.number().optional());

const stringArray = z.array(z.coerce.string()).catch([]);

const JudgeRecordSchema = z.object({
  style_similarity: finiteNumber,
  instruction_following: finiteNumber,
  task_fulfillment: finiteNumber,
  format_quality: finiteNumber,
  final_score: optionalFiniteNumber,
  reward: optionalFiniteNumber,
  violations: stringArray,
  positive_style_evidence: stringArray,
  negative_style_evidence: stringArray,
  brief_rationale: z.coerce.string().catch(""),
});

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function numberFromEvidence(evidence: unknown, key: string): number {
  if (!evidence || typeof evidence !== "object") return 0;
  const value = (evidence as Record<string, unknown>)[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fallbackJudgeRecord(deterministicEvidence: unknown, rationale: string): JudgeRecord {
  const styleSimilarity = clampScore(numberFromEvidence(deterministicEvidence, "aggregate_similarity") * 100);
  const finalScore = clampScore(0.60 * styleSimilarity);
  return {
    style_similarity: styleSimilarity,
    instruction_following: 0,
    task_fulfillment: 0,
    format_quality: 0,
    final_score: finalScore,
    reward: Math.max(-1, Math.min(1, (finalScore / 50) - 1)),
    violations: ["judge_output_parse_failed"],
    positive_style_evidence: [],
    negative_style_evidence: [],
    brief_rationale: rationale,
  };
}

export function normalizeJudgeRecord(value: unknown): JudgeRecord {
  const candidate = value && typeof value === "object" && "requiredShape" in value
    ? (value as { requiredShape: unknown }).requiredShape
    : value;
  const parsed = JudgeRecordSchema.parse(candidate);
  const finalScore = clampScore(parsed.final_score ?? (
    0.60 * parsed.style_similarity
    + 0.25 * parsed.instruction_following
    + 0.15 * parsed.task_fulfillment
  ));
  const reward = Math.max(-1, Math.min(1, parsed.reward ?? (finalScore / 50) - 1));

  return {
    style_similarity: clampScore(parsed.style_similarity),
    instruction_following: clampScore(parsed.instruction_following),
    task_fulfillment: clampScore(parsed.task_fulfillment),
    format_quality: clampScore(parsed.format_quality),
    final_score: finalScore,
    reward,
    violations: parsed.violations,
    positive_style_evidence: parsed.positive_style_evidence,
    negative_style_evidence: parsed.negative_style_evidence,
    brief_rationale: parsed.brief_rationale,
  };
}

export function judgeRecordFromText(text: string, deterministicEvidence: unknown): JudgeRecord {
  try {
    return normalizeJudgeRecord(parseJsonFromText<unknown>(text));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error.";
    return fallbackJudgeRecord(deterministicEvidence, `Judge output could not be parsed; using deterministic fallback. ${message}`);
  }
}

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

  const response = await generateAiText({
    settings: params.settings,
    kind: "judge",
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
  return judgeRecordFromText(response.text, params.deterministicEvidence);
}
