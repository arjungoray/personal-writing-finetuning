import { cp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { listProfiles } from "@/lib/profiles/store";
import { DatasetMetadataSchema } from "@/lib/datasets/types";
import { getDataSubdirectoryPath } from "@/lib/store/paths";
import { readJsonFile, writeJsonFile } from "@/lib/store/json";
import { listRunEvents } from "@/lib/runs/store";
import { RunStateSchema } from "@/lib/runs/types";

function runDir(runId: string) {
  return join(getDataSubdirectoryPath("runs"), runId);
}

export async function exportRunBundle(runId: string) {
  const baseRunDir = runDir(runId);
  const state = RunStateSchema.parse(await readJsonFile(join(baseRunDir, "run_state.json"), null));
  const datasetDir = join(getDataSubdirectoryPath("datasets"), state.datasetId);
  const metadata = DatasetMetadataSchema.parse(await readJsonFile(join(datasetDir, "metadata.json"), null));
  const profile = (await listProfiles()).find((candidate) => candidate.hash === metadata.profileHash);
  if (!profile) {
    throw new Error("Could not find approved style profile for run export.");
  }

  const exportDir = join(baseRunDir, "export");
  await mkdir(exportDir, { recursive: true });
  await writeJsonFile(join(exportDir, "approved_style_profile.json"), profile);
  await cp(datasetDir, join(exportDir, "dataset_version"), { recursive: true });
  if (existsSync(join(baseRunDir, "job.json"))) {
    await cp(join(baseRunDir, "job.json"), join(exportDir, "training_config.json"));
  }
  if (existsSync(join(baseRunDir, "run_events.jsonl"))) {
    await cp(join(baseRunDir, "run_events.jsonl"), join(exportDir, "run_events.jsonl"));
  }
  if (existsSync(join(baseRunDir, "checkpoints"))) {
    await cp(join(baseRunDir, "checkpoints"), join(exportDir, "checkpoints"), { recursive: true });
  }

  const events = await listRunEvents(runId);
  if (existsSync(join(baseRunDir, "judge_cache_summary.json"))) {
    await cp(join(baseRunDir, "judge_cache_summary.json"), join(exportDir, "judge_cache_summary.json"));
  } else {
    await writeJsonFile(join(exportDir, "judge_cache_summary.json"), {
      cacheRecords: 0,
      cacheHits: events.reduce((total, event) => total + (event.metrics.judge_cache_hits ?? 0), 0),
      note: "No judge cache summary was written for this run.",
    });
  }
  await writeJsonFile(join(exportDir, "eval_report.json"), {
    runId,
    finalEvalEvents: events.filter((event) => event.phase === "eval"),
  });
  await mkdir(join(exportDir, "final_lora_adapter"), { recursive: true });
  await writeFile(join(exportDir, "README.md"), `# Voice Lab Run Export\n\nRun: ${runId}\nDataset: ${state.datasetId}\nStatus: ${state.status}\n\nThis bundle was generated locally from .voice-lab artifacts.\n`, "utf8");

  return {
    runId,
    exportDir,
    files: [
      "approved_style_profile.json",
      "dataset_version/",
      "training_config.json",
      "judge_cache_summary.json",
      "run_events.jsonl",
      "eval_report.json",
      "checkpoints/",
      "final_lora_adapter/",
      "README.md",
    ],
  };
}
