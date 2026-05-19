import { z } from "zod";
import { writeFile } from "node:fs/promises";
import { DEFAULT_GENERATOR_MODEL, DEFAULT_JUDGE_MODEL, DEFAULT_RAY_UNSLOTH_PATH } from "@/lib/config/env";
import { DATA_DIR_CONFIG, getDataDir, getSettingsPath } from "@/lib/store/paths";
import { readJsonFile, writeJsonFile } from "@/lib/store/json";

export const SettingsSchema = z.object({
  dataDir: z.string().min(1),
  generatorModel: z.string().min(1),
  judgeModel: z.string().min(1),
  rayUnslothPath: z.string().min(1),
  activeTrainingConfig: z.literal("qwen3_5_4b_1x_l4"),
  mockMode: z.boolean(),
  smallSampleOverride: z.boolean(),
  datasetSeed: z.number().int().nonnegative(),
  trainingSeed: z.number().int().nonnegative(),
  checkpointInterval: z.number().int().positive(),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const defaultSettings: Settings = {
  dataDir: getDataDir(),
  generatorModel: process.env.GENERATOR_MODEL ?? DEFAULT_GENERATOR_MODEL,
  judgeModel: process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL,
  rayUnslothPath: process.env.RAY_UNSLOTH_PATH ?? DEFAULT_RAY_UNSLOTH_PATH,
  activeTrainingConfig: "qwen3_5_4b_1x_l4",
  mockMode: true,
  smallSampleOverride: false,
  datasetSeed: 1729,
  trainingSeed: 2718,
  checkpointInterval: 5,
};

export async function readSettings(): Promise<Settings> {
  const value = await readJsonFile(getSettingsPath(), defaultSettings);
  return SettingsSchema.parse({ ...defaultSettings, ...value, dataDir: getDataDir() });
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await readSettings();
  if (patch.dataDir && patch.dataDir !== current.dataDir) {
    await writeFile(DATA_DIR_CONFIG, `${JSON.stringify({ dataDir: patch.dataDir }, null, 2)}\n`, "utf8");
  }
  const next = SettingsSchema.parse({ ...current, ...patch, dataDir: getDataDir() });
  await writeJsonFile(getSettingsPath(), next);
  return next;
}
