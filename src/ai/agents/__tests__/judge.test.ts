import { describe, expect, it } from "vitest";
import { judgeRecordFromText, normalizeJudgeRecord } from "@/ai/agents/judge";

describe("normalizeJudgeRecord", () => {
  it("unwraps echoed requiredShape payloads", () => {
    expect(normalizeJudgeRecord({
      promptText: "p",
      requiredShape: {
        style_similarity: 10,
        instruction_following: 20,
        task_fulfillment: 30,
        format_quality: 40,
        final_score: 17,
        reward: -0.66,
      },
    })).toMatchObject({
      style_similarity: 10,
      instruction_following: 20,
      task_fulfillment: 30,
      format_quality: 40,
      final_score: 17,
      reward: -0.66,
    });
  });

  it("falls back for NaN judge scores", () => {
    expect(normalizeJudgeRecord({
      style_similarity: "NaN",
      instruction_following: Number.NaN,
      task_fulfillment: null,
      format_quality: "not a number",
    })).toMatchObject({
      style_similarity: 0,
      instruction_following: 0,
      task_fulfillment: 0,
      format_quality: 0,
      final_score: 0,
      reward: -1,
    });
  });

  it("returns a deterministic fallback for unparseable judge text", () => {
    const record = judgeRecordFromText(
      '{"style_similarity": 90, "brief_rationale": "bad "quote"}',
      { aggregate_similarity: 0.5 },
    );

    expect(record).toMatchObject({
      style_similarity: 50,
      instruction_following: 0,
      task_fulfillment: 0,
      final_score: 30,
      reward: -0.4,
      violations: ["judge_output_parse_failed"],
    });
  });
});
