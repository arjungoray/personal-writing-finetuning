import { appendFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getDataDir } from "@/lib/store/paths";

export type AiUsageRecord = {
  timestamp: string;
  kind: "generator" | "judge";
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

function usagePath() {
  return join(getDataDir(), "usage.jsonl");
}

export async function recordAiUsage(record: Omit<AiUsageRecord, "timestamp">) {
  const next: AiUsageRecord = {
    ...record,
    timestamp: new Date().toISOString(),
  };
  await appendFile(usagePath(), `${JSON.stringify(next)}\n`, "utf8");
  return next;
}

export async function listAiUsage(): Promise<AiUsageRecord[]> {
  if (!existsSync(usagePath())) return [];
  const raw = await readFile(usagePath(), "utf8");
  return raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as AiUsageRecord);
}

export async function summarizeAiUsage() {
  const records = await listAiUsage();
  return {
    records,
    totals: records.reduce(
      (totals, record) => {
        totals.inputTokens += record.inputTokens;
        totals.outputTokens += record.outputTokens;
        totals.totalTokens += record.totalTokens;
        if (record.kind === "generator") totals.generatorCalls += 1;
        if (record.kind === "judge") totals.judgeCalls += 1;
        return totals;
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0, generatorCalls: 0, judgeCalls: 0 },
    ),
  };
}
