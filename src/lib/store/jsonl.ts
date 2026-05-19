import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export async function writeJsonlFile(path: string, records: unknown[]) {
  await mkdir(dirname(path), { recursive: true });
  const body = records.map((record) => JSON.stringify(record)).join("\n");
  await writeFile(path, `${body}${body ? "\n" : ""}`, "utf8");
}
