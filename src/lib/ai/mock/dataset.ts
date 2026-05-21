import { randomUUID } from "node:crypto";
import type { DatasetPromptRecord, TaskType } from "@/lib/datasets/types";
import type { StyleProfile } from "@/lib/profiles/types";
import type { WritingRecord } from "@/lib/writings/store";

export const defaultPromptMix: Record<TaskType, number> = {
  rewrite_in_my_voice: 0.35,
  write_from_bullets: 0.25,
  improve_clarity: 0.15,
  change_tone: 0.1,
  email_generation: 0.1,
  summarize_or_expand: 0.05,
};

const taskLabels: Record<TaskType, string> = {
  rewrite_in_my_voice: "Rewrite this in my voice while preserving meaning",
  write_from_bullets: "Write from these bullets in my style",
  improve_clarity: "Improve clarity while preserving meaning",
  change_tone: "Change tone while staying in my style",
  email_generation: "Write an email or message in my style",
  summarize_or_expand: "Summarize or expand in my style",
};

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMockDatasetRecords(params: {
  profile: StyleProfile;
  writings: WritingRecord[];
  promptCount: number;
  seed: number;
  generatorModel: string;
  timestamp: string;
}): DatasetPromptRecord[] {
  const rng = mulberry32(params.seed);
  const tasks = Object.entries(defaultPromptMix).flatMap(([task, weight]) =>
    Array.from({ length: Math.round(params.promptCount * weight) }, () => task as TaskType),
  ).slice(0, params.promptCount);

  while (tasks.length < params.promptCount) tasks.push("rewrite_in_my_voice");

  return tasks.map((taskType, index) => {
    const reference = params.writings[Math.floor(rng() * params.writings.length)];
    const excerpt = reference.text.trim().slice(0, 220);
    const split = index % 5 === 0 ? "eval" : "train";

    return {
      id: randomUUID(),
      split,
      taskType,
      writingModeTags: reference.modeTags,
      promptText: `${taskLabels[taskType]}:\n\n${excerpt ? "[user-provided content omitted from hidden references]" : "Use the supplied requirements."}`,
      selectedReferenceExcerptIds: [reference.textHash],
      expectedTraits: params.profile.coachingRules.prefer.slice(0, 4),
      negativeCriteria: params.profile.coachingRules.negativeRewardViolations,
      profileVersionHash: params.profile.hash,
      generatorModel: params.generatorModel,
      generationSeed: params.seed,
      generationTimestamp: params.timestamp,
      approved: false,
    };
  });
}
