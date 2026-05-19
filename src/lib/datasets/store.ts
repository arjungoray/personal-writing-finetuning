import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { generateMockDatasetRecords, defaultPromptMix } from "@/lib/ai/mock/dataset";
import { DatasetMetadataSchema, DatasetPromptRecordSchema, type DatasetMetadata } from "@/lib/datasets/types";
import { emptyIndex, initializeDataDirectory, type VoiceLabIndex } from "@/lib/store/init";
import { readJsonFile, writeJsonFile } from "@/lib/store/json";
import { writeJsonlFile } from "@/lib/store/jsonl";
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
  const records = generateMockDatasetRecords({
    profile,
    writings,
    promptCount: input.promptCount,
    seed,
    generatorModel: settings.generatorModel,
    timestamp,
  }).map((record) => DatasetPromptRecordSchema.parse(record));

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
  await writeJsonlFile(join(datasetDir(id), "rl_prompts.jsonl"), train);
  await writeJsonlFile(join(datasetDir(id), "eval_prompts.jsonl"), evalRecords);
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
