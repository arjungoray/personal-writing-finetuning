import { mkdir } from "node:fs/promises";
import { getDataDir, getDataSubdirectoryPath, dataSubdirectories, getIndexPath, getSettingsPath } from "@/lib/store/paths";
import { readJsonFile, writeJsonFile } from "@/lib/store/json";
import { readSettings } from "@/lib/store/settings";

export type VoiceLabIndex = {
  version: 1;
  writings: string[];
  profiles: string[];
  datasets: string[];
  runs: string[];
  playgroundResults: string[];
  updatedAt: string;
};

export const emptyIndex: VoiceLabIndex = {
  version: 1,
  writings: [],
  profiles: [],
  datasets: [],
  runs: [],
  playgroundResults: [],
  updatedAt: new Date(0).toISOString(),
};

export async function initializeDataDirectory() {
  await mkdir(getDataDir(), { recursive: true });
  await Promise.all(dataSubdirectories.map((subdirectory) => mkdir(getDataSubdirectoryPath(subdirectory), { recursive: true })));

  await writeJsonFile(getSettingsPath(), await readSettings());
  const index = await readJsonFile(getIndexPath(), emptyIndex);
  if (index.updatedAt === emptyIndex.updatedAt) {
    await writeJsonFile(getIndexPath(), { ...emptyIndex, updatedAt: new Date().toISOString() });
  }

  return {
    dataDir: getDataDir(),
    subdirectories: dataSubdirectories,
  };
}
