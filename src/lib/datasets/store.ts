import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { generateDatasetRecordsWithMastra } from "@/ai/workflows/profile-dataset";
import { defaultPromptMix } from "@/lib/ai/mock/dataset";
import { DatasetMetadataSchema, DatasetPromptRecordSchema, type DatasetMetadata, type DatasetPromptRecord } from "@/lib/datasets/types";
import { emptyIndex, initializeDataDirectory, type VoiceLabIndex } from "@/lib/store/init";
import { readJsonFile, writeJsonFile } from "@/lib/store/json";
import { readJsonlFile, writeJsonlFile } from "@/lib/store/jsonl";
import { getDataSubdirectoryPath, getIndexPath } from "@/lib/store/paths";
import { readSettings } from "@/lib/store/settings";
import { readProfile } from "@/lib/profiles/store";
import { listWritingRecords } from "@/lib/writings/store";

export const GenerateDatasetRequestSchema = z.object({
  profileId: z.string().min(1),
  promptCount: z.number().int().positive().default(200),
  seed: z.number().int().nonnegative().optional(),
});

function datasetDir(id: string) {
  return join(getDataSubdirectoryPath("datasets"), id);
}

function trainPromptsPath(id: string) {
  return join(datasetDir(id), "rl_prompts.jsonl");
}

function evalPromptsPath(id: string) {
  return join(datasetDir(id), "eval_prompts.jsonl");
}

export async function listDatasets(): Promise<DatasetMetadata[]> {
  await initializeDataDirectory();
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(getDataSubdirectoryPath("datasets"), { withFileTypes: true });
  const metadata = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readJsonFile<DatasetMetadata | null>(join(getDataSubdirectoryPath("datasets"), entry.name, "metadata.json"), null)),
  );
  return metadata.filter((item): item is DatasetMetadata => item !== null).sort((a, b) => b.generationTimestamp.localeCompare(a.generationTimestamp));
}

export async function generateDataset(input: z.infer<typeof GenerateDatasetRequestSchema>): Promise<DatasetMetadata> {
  await initializeDataDirectory();
  const settings = await readSettings();
  const profile = await readProfile(input.profileId);
  if (profile.status !== "approved") {
    throw new Error("Dataset generation requires an approved style profile.");
  }

  const writings = (await listWritingRecords()).filter((writing) => profile.sourceWritingIds.includes(writing.id));
  const timestamp = new Date().toISOString();
  const seed = input.seed ?? settings.datasetSeed;
  const records = (await generateDatasetRecordsWithMastra({
    settings,
    profile,
    writings,
    promptCount: input.promptCount,
    seed,
    timestamp,
  })).map((record) => DatasetPromptRecordSchema.parse(record));

  const id = `dataset_${Date.now()}`;
  const train = records.filter((record) => record.split === "train");
  const evalRecords = records.filter((record) => record.split === "eval");
  const metadata = DatasetMetadataSchema.parse({
    id,
    status: "draft",
    profileHash: profile.hash,
    generatorModel: settings.generatorModel,
    promptCount: records.length,
    trainCount: train.length,
    evalCount: evalRecords.length,
    seed,
    promptMix: defaultPromptMix,
    rubricVersion: "v1",
    generationTimestamp: timestamp,
  });

  await mkdir(datasetDir(id), { recursive: true });
  await writeJsonlFile(trainPromptsPath(id), train);
  await writeJsonlFile(evalPromptsPath(id), evalRecords);
  await writeJsonFile(join(datasetDir(id), "metadata.json"), metadata);

  const index = await readJsonFile<VoiceLabIndex>(getIndexPath(), emptyIndex);
  await writeJsonFile(getIndexPath(), {
    ...index,
    datasets: Array.from(new Set([...index.datasets, id])),
    updatedAt: timestamp,
  });
  return metadata;
}

export async function approveDataset(id: string): Promise<DatasetMetadata> {
  const metadataPath = join(datasetDir(id), "metadata.json");
  const current = DatasetMetadataSchema.parse(await readJsonFile(metadataPath, null));
  const approved = DatasetMetadataSchema.parse({ ...current, status: "approved" });
  await writeJsonFile(metadataPath, approved);
  return approved;
}

export async function listDatasetRecords(id: string): Promise<DatasetPromptRecord[]> {
  const train = await readJsonlFile<DatasetPromptRecord>(trainPromptsPath(id));
  const evalRecords = await readJsonlFile<DatasetPromptRecord>(evalPromptsPath(id));
  return [...train, ...evalRecords];
}

async function writeDatasetRecords(id: string, records: DatasetPromptRecord[]) {
  await writeJsonlFile(trainPromptsPath(id), records.filter((record) => record.split === "train"));
  await writeJsonlFile(evalPromptsPath(id), records.filter((record) => record.split === "eval"));
}

export async function bulkApproveDatasetRecords(id: string, recordIds?: string[]) {
  const selected = new Set(recordIds);
  const approveAll = !recordIds || recordIds.length === 0;
  const records = (await listDatasetRecords(id)).map((record) =>
    approveAll || selected.has(record.id) ? { ...record, approved: true } : record,
  );
  await writeDatasetRecords(id, records);
  return { records };
}

export async function deleteDatasetRecord(id: string, recordId: string) {
  const records = (await listDatasetRecords(id)).filter((record) => record.id !== recordId);
  await writeDatasetRecords(id, records);
  return { records };
}

export async function regenerateDatasetRecord(id: string, recordId: string) {
  const records = (await listDatasetRecords(id)).map((record) =>
    record.id === recordId
      ? {
          ...record,
          promptText: `${record.promptText}\n\nRegenerated variant: preserve the same task while changing surface wording.`,
          approved: false,
        }
      : record,
  );
  await writeDatasetRecords(id, records);
  return { records };
}
