import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { emptyIndex, initializeDataDirectory, type VoiceLabIndex } from "@/lib/store/init";
import { readJsonFile, writeJsonFile } from "@/lib/store/json";
import { getDataSubdirectoryPath, getIndexPath } from "@/lib/store/paths";

export const PlaygroundRequestSchema = z.object({
  prompt: z.string().min(1),
  runId: z.string().optional(),
  referenceExcerpt: z.string().optional(),
});

export const PlaygroundResultSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  runId: z.string().nullable(),
  referenceExcerpt: z.string().nullable(),
  baseOutput: z.string(),
  trainedAdapterOutput: z.string(),
  scoreReport: z.object({
    baseStyleScore: z.number(),
    trainedStyleScore: z.number(),
    judgeModel: z.string(),
  }),
  createdAt: z.string(),
});

export type PlaygroundResult = z.infer<typeof PlaygroundResultSchema>;

function playgroundPath(id: string) {
  return join(getDataSubdirectoryPath("playground"), `${id}.json`);
}

export async function listPlaygroundResults(): Promise<PlaygroundResult[]> {
  await initializeDataDirectory();
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(getDataSubdirectoryPath("playground"))).filter((file) => file.endsWith(".json"));
  const results = await Promise.all(files.map((file) => readJsonFile<PlaygroundResult | null>(join(getDataSubdirectoryPath("playground"), file), null)));
  return results.filter((result): result is PlaygroundResult => result !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createPlaygroundResult(input: z.infer<typeof PlaygroundRequestSchema>): Promise<PlaygroundResult> {
  await initializeDataDirectory();
  const now = new Date().toISOString();
  const result = PlaygroundResultSchema.parse({
    id: `playground_${Date.now()}_${randomUUID().slice(0, 8)}`,
    prompt: input.prompt,
    runId: input.runId ?? null,
    referenceExcerpt: input.referenceExcerpt ?? null,
    baseOutput: `Base model draft:\n\n${input.prompt}\n\nThis response is intentionally plain for mock comparison.`,
    trainedAdapterOutput: `Trained adapter draft:\n\n${input.prompt}\n\nI kept it direct, specific, and easy to scan.`,
    scoreReport: {
      baseStyleScore: 58,
      trainedStyleScore: 82,
      judgeModel: "mock-judge",
    },
    createdAt: now,
  });
  await writeJsonFile(playgroundPath(result.id), result);
  const index = await readJsonFile<VoiceLabIndex>(getIndexPath(), emptyIndex);
  await writeJsonFile(getIndexPath(), {
    ...index,
    playgroundResults: Array.from(new Set([...index.playgroundResults, result.id])),
    updatedAt: now,
  });
  return result;
}

export async function deletePlaygroundResult(id: string) {
  await rm(playgroundPath(id), { force: true });
  const index = await readJsonFile<VoiceLabIndex>(getIndexPath(), emptyIndex);
  await writeJsonFile(getIndexPath(), {
    ...index,
    playgroundResults: index.playgroundResults.filter((resultId) => resultId !== id),
    updatedAt: new Date().toISOString(),
  });
  return { deleted: true };
}
