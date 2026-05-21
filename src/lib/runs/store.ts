import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { z } from "zod";
import { DatasetMetadataSchema } from "@/lib/datasets/types";
import { emptyIndex, initializeDataDirectory, type VoiceLabIndex } from "@/lib/store/init";
import { readJsonFile, writeJsonFile } from "@/lib/store/json";
import { getDataDir, getDataSubdirectoryPath, getIndexPath } from "@/lib/store/paths";
import { readSettings } from "@/lib/store/settings";
import { RunStateSchema, type RunEvent, type RunState } from "@/lib/runs/types";
import { ACTIVE_TRAINING_CONFIG_FILE, ACTIVE_TRAINING_MODEL } from "@/lib/training/config";

export const StartRunRequestSchema = z.object({
  datasetId: z.string().min(1),
  totalSteps: z.number().int().positive().default(10),
  mockMode: z.boolean().default(true),
});

export type StartRunInput = z.infer<typeof StartRunRequestSchema> & {
  appBaseUrl?: string;
};

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

function attachWorkerOutput(child: ChildProcess, runId: string) {
  const prefix = `[voice-lab][worker][${runId}]`;
  const forward = (stream: NodeJS.WriteStream, logLine: (line: string) => void) => (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    stream.write(text);
    for (const line of text.split(/\r?\n/)) {
      if (line.length > 0) {
        logLine(line);
      }
    }
  };

  child.stdout?.on("data", forward(process.stdout, (line) => console.log(`${prefix} ${line}`)));
  child.stderr?.on("data", forward(process.stderr, (line) => console.error(`${prefix} ${line}`)));
}

function spawnTrainingWorker(runId: string, jobPath: string) {
  const relativeJobPath = relative(process.cwd(), jobPath);
  return spawn("python3", ["-u", "worker/train.py", "--job", relativeJobPath], {
    cwd: process.cwd(),
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
}

async function assertNoActiveRun() {
  const active = (await listRuns()).find((run) => ["queued", "running", "cancel_requested"].includes(run.status));
  if (active) {
    throw new Error(`Run ${active.id} is already active.`);
  }
}

export async function startRun(input: StartRunInput): Promise<RunState> {
  await initializeDataDirectory();
  await assertNoActiveRun();
  const settings = await readSettings();
  const dataset = DatasetMetadataSchema.parse(await readJsonFile(datasetMetadataPath(input.datasetId), null));
  if (dataset.status !== "approved") {
    throw new Error("Training requires an approved dataset version.");
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
    appBaseUrl: input.appBaseUrl,
    rayUnslothPath: settings.rayUnslothPath,
    configPath: join(settings.rayUnslothPath, "configs", ACTIVE_TRAINING_CONFIG_FILE),
    trainingBaseModel: ACTIVE_TRAINING_MODEL,
  });

  console.log(
    `[voice-lab] Spawning training worker for run ${id} (mockMode=${input.mockMode}, totalSteps=${input.totalSteps}, job=${jobPath})`,
  );
  const child = spawnTrainingWorker(id, jobPath);
  attachWorkerOutput(child, id);
  child.on("error", (error) => {
    console.error(`[voice-lab] Failed to spawn training worker for run ${id}:`, error);
  });
  child.on("exit", (code, signal) => {
    const label = code === 0 ? "completed" : "failed";
    console.log(`[voice-lab] Training worker exited for run ${id} (${label}, code=${code ?? "null"}, signal=${signal ?? "null"})`);
  });
  child.unref();

  const runningState = RunStateSchema.parse({ ...state, status: "running", pid: child.pid ?? null, startedAt: new Date().toISOString(), currentPhase: "starting" });
  console.log(`[voice-lab] Run ${id} marked running (pid=${child.pid ?? "unknown"})`);
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

  await new Promise((resolve) => setTimeout(resolve, 1500));
  const latest = RunStateSchema.parse(await readJsonFile(runStatePath(id), next));
  if (!["cancel_requested", "running"].includes(latest.status) || latest.pid === null) {
    return latest;
  }

  try {
    process.kill(latest.pid, "SIGTERM");
    const killed = RunStateSchema.parse({
      ...latest,
      status: "cancelled",
      finishedAt: new Date().toISOString(),
      currentPhase: "force-killed",
    });
    await writeJsonFile(runStatePath(id), killed);
    return killed;
  } catch {
    return latest;
  }
}

export async function resumeRun(id: string): Promise<RunState> {
  await assertNoActiveRun();
  const current = RunStateSchema.parse(await readJsonFile(runStatePath(id), null));
  if (!["cancelled", "failed"].includes(current.status)) {
    throw new Error("Only cancelled or failed runs can be resumed.");
  }
  const jobPath = join(runDir(id), "job.json");
  console.log(`[voice-lab] Resuming training worker for run ${id} (job=${jobPath})`);
  const child = spawnTrainingWorker(id, jobPath);
  attachWorkerOutput(child, id);
  child.on("error", (error) => {
    console.error(`[voice-lab] Failed to resume training worker for run ${id}:`, error);
  });
  child.on("exit", (code, signal) => {
    const label = code === 0 ? "completed" : "failed";
    console.log(`[voice-lab] Resumed training worker exited for run ${id} (${label}, code=${code ?? "null"}, signal=${signal ?? "null"})`);
  });
  child.unref();
  const next = RunStateSchema.parse({
    ...current,
    status: "running",
    pid: child.pid ?? null,
    finishedAt: null,
    currentPhase: "resuming",
  });
  await writeJsonFile(runStatePath(id), next);
  return next;
}
