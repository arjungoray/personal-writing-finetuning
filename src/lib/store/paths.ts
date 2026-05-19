import { join, resolve } from "node:path";

export const DEFAULT_DATA_DIR = ".voice-lab";

export const dataSubdirectories = [
  "uploads",
  "writings",
  "profiles",
  "datasets",
  "runs",
  "models",
  "judge-cache",
  "playground",
] as const;

export type DataSubdirectory = (typeof dataSubdirectories)[number];

export function getDataDir() {
  return resolve(process.cwd(), process.env.VOICE_LAB_DATA_DIR ?? DEFAULT_DATA_DIR);
}

export function getSettingsPath() {
  return join(getDataDir(), "settings.json");
}

export function getIndexPath() {
  return join(getDataDir(), "index.json");
}

export function getDataSubdirectoryPath(subdirectory: DataSubdirectory) {
  return join(getDataDir(), subdirectory);
}
