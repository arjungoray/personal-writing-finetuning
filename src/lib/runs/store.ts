import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { DatasetMetadataSchema } from "@/lib/datasets/types";
import { emptyIndex, initializeDataDirectory, type VoiceLabIndex } from "@/lib/store/init";
import { readJsonFile, writeJsonFile } from "@/lib/store/json";
import { getDataDir, getDataSubdirectoryPath, getIndexPath } from "@/lib/store/paths";
import { readSettings } from "@/lib/store/settings";
import { RunStateSchema, type RunEvent, type RunState } from "@/lib/runs/types";

export const StartRunRequestSchema = z.object({
  datasetId: z.string().min(1),
  totalSteps: z.number().int().positive().default(10),
  mockMode: z.boolean().default(true),
});

function runDir(id: string) {
  return join(getDataSubdirectoryPath("runs"), id);
}

function runStatePath(id: string) {
  return join(runDir(id), "run_state.json");
}

function runEventsPath(id: string) {
  return join(runDir(id), "run_events.jsonl");
}

function datasetMetadataPath(datasetId: string) {
  return join(getDataSubdirectoryPath("datasets"), datasetId, "metadata.json");
}

export async function listRuns(): Promise<RunState[]> {
  await initializeDataDirectory();
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(getDataSubdirectoryPath("runs"), { withFileTypes: true });
  const runs = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readJsonFile<RunState | null>(runStatePath(entry.name), null)));
  return runs.filter((run): run is RunState => run !== null).sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

export async function listRunEvents(id: string): Promise<RunEvent[]> {
  if (!existsSync(runEventsPath(id))) return [];
  const raw = await readFile(runEventsPath(id), "utf8");
  return raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as RunEvent);
}

async function assertNoActiveRun() {
  const active = (await listRuns()).find((run) => ["queued", "running", "cancel_requested"].includes(run.status));
  if (active) {
    throw new Error(`Run ${active.id} is already active.`);
  }
}

export async function startRun(input: z.infer<typeof StartRunRequestSchema>): Promise<RunState> {
  await initializeDataDirectory();
  await assertNoActiveRun();
  const settings = await readSettings();
  const dataset = DatasetMetadataSchema.parse(await readJsonFile(datasetMetadataPath(input.datasetId), null));
  if (dataset.status !== "approved") {
    throw new Error("Training requires an approved dataset version.");
  }
  if (!input.mockMode) {
    throw new Error("Live Ray-Unsloth training is not wired in this stack layer yet; use mockMode.");
  }

  const id = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const dir = runDir(id);
  await mkdir(dir, { recursive: true });
  const state = RunStateSchema.parse({
    id,
    datasetId: input.datasetId,
    status: "queued",
    pid: null,
    mockMode: input.mockMode,
    startedAt: null,
    finishedAt: null,
    completedSteps: 0,
    totalSteps: input.totalSteps,
    currentPhase: "queued",
    trainingSeed: settings.trainingSeed,
    checkpointInterval: settings.checkpointInterval,
    error: null,
  });
  await writeJsonFile(runStatePath(id), state);

  const jobPath = join(dir, "job.json");
  await writeJsonFile(jobPath, {
    runId: id,
    runDir: dir,
    dataDir: getDataDir(),
    datasetId: input.datasetId,
    datasetDir: join(getDataSubdirectoryPath("datasets"), input.datasetId),
    totalSteps: input.totalSteps,
    checkpointInterval: settings.checkpointInterval,
    trainingSeed: settings.trainingSeed,
    mockMode: input.mockMode,
  });

  const child = spawn("python3", ["worker/train.py", "--job", relative(process.cwd(), jobPath)], {
    cwd: process.cwd(),
    detached: false,
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.unref();

  const runningState = RunStateSchema.parse({ ...state, status: "running", pid: child.pid ?? null, startedAt: new Date().toISOString(), currentPhase: "starting" });
  await writeJsonFile(runStatePath(id), runningState);
  const index = await readJsonFile<VoiceLabIndex>(getIndexPath(), emptyIndex);
  await writeJsonFile(getIndexPath(), {
    ...index,
    runs: Array.from(new Set([...index.runs, id])),
    updatedAt: runningState.startedAt,
  });
  return runningState;
}

export async function requestRunCancellation(id: string): Promise<RunState> {
  const current = RunStateSchema.parse(await readJsonFile(runStatePath(id), null));
  const next = RunStateSchema.parse({ ...current, status: "cancel_requested", currentPhase: "cancelling" });
  await writeJsonFile(join(runDir(id), "cancel_requested"), { requestedAt: new Date().toISOString() });
  await writeJsonFile(runStatePath(id), next);
  return next;
}
