import { z } from "zod";

export const TaskTypeSchema = z.enum([
  "rewrite_in_my_voice",
  "write_from_bullets",
  "improve_clarity",
  "change_tone",
  "email_generation",
  "summarize_or_expand",
]);

export const DatasetPromptRecordSchema = z.object({
  id: z.string(),
  split: z.enum(["train", "eval"]),
  taskType: TaskTypeSchema,
  writingModeTags: z.array(z.string()),
  promptText: z.string(),
  selectedReferenceExcerptIds: z.array(z.string()),
  expectedTraits: z.array(z.string()),
  negativeCriteria: z.array(z.string()),
  profileVersionHash: z.string(),
  generatorModel: z.string(),
  generationSeed: z.number().int(),
  generationTimestamp: z.string(),
  approved: z.boolean(),
});

export const DatasetMetadataSchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "approved"]),
  profileHash: z.string(),
  generatorModel: z.string(),
  promptCount: z.number().int().positive(),
  trainCount: z.number().int().nonnegative(),
  evalCount: z.number().int().nonnegative(),
  seed: z.number().int(),
  promptMix: z.record(z.number()),
  rubricVersion: z.literal("v1"),
  generationTimestamp: z.string(),
});

export type TaskType = z.infer<typeof TaskTypeSchema>;
export type DatasetPromptRecord = z.infer<typeof DatasetPromptRecordSchema>;
export type DatasetMetadata = z.infer<typeof DatasetMetadataSchema>;
