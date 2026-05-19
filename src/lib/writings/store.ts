import { randomUUID, createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { getDataSubdirectoryPath } from "@/lib/store/paths";
import { readJsonFile, writeJsonFile } from "@/lib/store/json";
import { emptyIndex, initializeDataDirectory, type VoiceLabIndex } from "@/lib/store/init";
import { evaluateCorpusPolicy } from "@/lib/writings/corpus";
import { readSettings } from "@/lib/store/settings";
import { getIndexPath } from "@/lib/store/paths";

export const WritingInputSchema = z.object({
  title: z.string().min(1).max(160),
  sourceType: z.enum(["pasted_text", "txt", "md"]),
  text: z.string().min(1),
  modeTags: z.array(z.enum(["email", "essay", "technical_note", "casual_message"])).default([]),
  extractionWarnings: z.array(z.string()).default([]),
});

export const WritingRecordSchema = WritingInputSchema.extend({
  id: z.string(),
  textHash: z.string(),
  wordCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  policy: z.object({
    wordCount: z.number().int().nonnegative(),
    canGenerateDataset: z.boolean(),
    canTrain: z.boolean(),
    warning: z.string().nullable(),
    blockedReason: z.string().nullable(),
  }),
});

export type WritingInput = z.infer<typeof WritingInputSchema>;
export type WritingRecord = z.infer<typeof WritingRecordSchema>;

function writingPath(id: string) {
  return join(getDataSubdirectoryPath("writings"), `${id}.json`);
}

function hashText(text: string) {
  return createHash("sha256").update(text).digest("hex");
}

export async function listWritingRecords(): Promise<WritingRecord[]> {
  await initializeDataDirectory();
  const { readdir } = await import("node:fs/promises");
  const dir = getDataSubdirectoryPath("writings");
  const files = (await readdir(dir)).filter((file) => file.endsWith(".json"));
  const records = await Promise.all(files.map((file) => readJsonFile<WritingRecord | null>(join(dir, file), null)));
  const validRecords = records.filter((record): record is WritingRecord => record !== null);
  return validRecords.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createWritingRecord(input: WritingInput): Promise<WritingRecord> {
  await initializeDataDirectory();
  const settings = await readSettings();
  const parsed = WritingInputSchema.parse(input);
  const now = new Date().toISOString();
  const textHash = hashText(parsed.text);
  const record: WritingRecord = WritingRecordSchema.parse({
    ...parsed,
    id: randomUUID(),
    textHash,
    wordCount: evaluateCorpusPolicy(parsed.text, settings.smallSampleOverride).wordCount,
    createdAt: now,
    updatedAt: now,
    policy: evaluateCorpusPolicy(parsed.text, settings.smallSampleOverride),
  });

  await writeJsonFile(writingPath(record.id), record);
  const index = await readJsonFile<VoiceLabIndex>(getIndexPath(), emptyIndex);
  await writeJsonFile(getIndexPath(), {
    ...index,
    writings: Array.from(new Set([...index.writings, record.id])),
    updatedAt: now,
  });
  return record;
}
