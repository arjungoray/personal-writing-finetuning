import { join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

export const DEFAULT_DATA_DIR = ".voice-lab";
export const DATA_DIR_CONFIG = ".voice-lab-config.json";

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
  if (process.env.VOICE_LAB_DATA_DIR) {
    return resolve(process.cwd(), process.env.VOICE_LAB_DATA_DIR);
  }
  const configPath = resolve(process.cwd(), DATA_DIR_CONFIG);
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, "utf8")) as { dataDir?: string };
      if (config.dataDir) return resolve(process.cwd(), config.dataDir);
    } catch {
      return resolve(process.cwd(), DEFAULT_DATA_DIR);
    }
  }
  return resolve(process.cwd(), DEFAULT_DATA_DIR);
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
