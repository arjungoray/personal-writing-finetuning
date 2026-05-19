import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJsonlFile<T>(path: string): Promise<T[]> {
  const raw = await readFile(path, "utf8");
  return raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

export async function writeJsonlFile(path: string, records: unknown[]) {
  await mkdir(dirname(path), { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join("\n");
  await writeFile(path, `${body}${body ? "\n" : ""}`, "utf8");
}
