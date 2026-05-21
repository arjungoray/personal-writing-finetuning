import { generateMockDatasetRecords } from "@/lib/ai/mock/dataset";
import { parseJsonFromText } from "@/ai/mastra/json";
import { generateAiText } from "@/ai/mastra/provider";
import { DatasetPromptRecordSchema, type DatasetPromptRecord, type TaskType } from "@/lib/datasets/types";
import type { StyleProfile } from "@/lib/profiles/types";
import type { Settings } from "@/lib/store/settings";
import type { WritingRecord } from "@/lib/writings/store";

const DATASET_BATCH_SIZE = 20;
const DATASET_MAX_EXTRA_BATCH_ATTEMPTS = 3;

const TASK_TYPE_ALIAS_MAP: Record<string, TaskType> = {
  rewrite: "rewrite_in_my_voice",
  rewriteinmyvoice: "rewrite_in_my_voice",
  writefrombullets: "write_from_bullets",
  bullets: "write_from_bullets",
  clarity: "improve_clarity",
  improveclarity: "improve_clarity",
  tone: "change_tone",
  changetone: "change_tone",
  email: "email_generation",
  emailgeneration: "email_generation",
  summarize: "summarize_or_expand",
  expand: "summarize_or_expand",
  summarizeorexpand: "summarize_or_expand",
  summarizeexpand: "summarize_or_expand",
};

function normalizeTaskType(value: unknown): TaskType | unknown {
  if (typeof value !== "string") return value;
  const key = value.toLowerCase().replace(/[^a-z]/g, "");
  return TASK_TYPE_ALIAS_MAP[key] ?? value;
}

function normalizeDatasetRecord(
  record: unknown,
  index: number,
  params: {
    profile: StyleProfile;
    settings: Settings;
    seed: number;
    timestamp: string;
  },
) {
  return DatasetPromptRecordSchema.parse({
    ...(record as Record<string, unknown>),
    taskType: normalizeTaskType((record as Record<string, unknown>).taskType),
    split: index % 5 === 0 ? "eval" : "train",
    profileVersionHash: params.profile.hash,
    generatorModel: params.settings.generatorModel,
    generationSeed: params.seed,
    generationTimestamp: params.timestamp,
    approved: false,
  });
}

async function generateDatasetBatch(params: {
  settings: Settings;
  profile: StyleProfile;
  writings: WritingRecord[];
  promptCount: number;
  seed: number;
  batchIndex: number;
  totalBatches: number;
}): Promise<unknown[]> {
  const response = await generateAiText({
    settings: params.settings,
    kind: "generator",
    model: params.settings.generatorModel,
    maxOutputTokens: 8192,
    system:
      "You generate RL prompt datasets as strict JSON arrays only. Return exactly the requested number of records. Do not include reference excerpts in promptText. Escape all quotes and newlines inside JSON strings.",
    prompt: JSON.stringify({
      profile: params.profile,
      promptCount: params.promptCount,
      seed: params.seed,
      batchIndex: params.batchIndex,
      totalBatches: params.totalBatches,
      taskMix: "35 rewrite, 25 bullets, 15 clarity, 10 tone, 10 email, 5 summarize/expand",
      writings: params.writings.map((writing) => ({
        textHash: writing.textHash,
        modeTags: writing.modeTags,
        excerpt: writing.text.slice(0, 500),
      })),
      requiredRecordFields: [
        "id",
        "split",
        "taskType",
        "writingModeTags",
        "promptText",
        "selectedReferenceExcerptIds",
        "expectedTraits",
        "negativeCriteria",
      ],
    }),
  });

  return parseJsonFromText<unknown[]>(response.text);
}

export async function generateDatasetRecordsWithMastra(params: {
  settings: Settings;
  profile: StyleProfile;
  writings: WritingRecord[];
  promptCount: number;
  seed: number;
  timestamp: string;
}): Promise<DatasetPromptRecord[]> {
  if (params.settings.mockMode) {
    return generateMockDatasetRecords({
      profile: params.profile,
      writings: params.writings,
      promptCount: params.promptCount,
      seed: params.seed,
      generatorModel: params.settings.generatorModel,
      timestamp: params.timestamp,
    });
  }

  const parsed: unknown[] = [];
  const totalBatches = Math.ceil(params.promptCount / DATASET_BATCH_SIZE);
  const maxAttempts = totalBatches + DATASET_MAX_EXTRA_BATCH_ATTEMPTS;

  for (let batchIndex = 0; parsed.length < params.promptCount && batchIndex < maxAttempts; batchIndex += 1) {
    const remaining = params.promptCount - parsed.length;
    const batchCount = Math.min(DATASET_BATCH_SIZE, remaining);
    const batch = await generateDatasetBatch({
      settings: params.settings,
      profile: params.profile,
      writings: params.writings,
      promptCount: batchCount,
      seed: params.seed + batchIndex,
      batchIndex,
      totalBatches,
    });
    parsed.push(...batch.slice(0, batchCount));
  }
  if (parsed.length < params.promptCount) {
    throw new Error(`Dataset generation produced ${parsed.length}/${params.promptCount} parseable records.`);
  }

  return parsed.map((record, index) =>
    normalizeDatasetRecord(record, index, {
      profile: params.profile,
      settings: params.settings,
      seed: params.seed,
      timestamp: params.timestamp,
    }),
  );
}
