"use client";

import { useMemo, useState } from "react";
import { Database, FileText, Play, RefreshCw, Settings, Sparkles } from "lucide-react";
import type { SetupCheck } from "@/lib/setup/checklist";

type RunState = {
  id: string;
  status: string;
  completedSteps: number;
  totalSteps: number;
  currentPhase: string;
};

type FlowIds = {
  writingId?: string;
  profileId?: string;
  datasetId?: string;
  runId?: string;
};

type ExtractedUpload = {
  fileName: string;
  sourceType: "txt" | "md" | "pdf" | "docx";
  text: string;
  warnings: string[];
};

type ApiRunEvent = {
  phase: string;
  step: number;
  message: string;
  metrics?: Record<string, number>;
};

const sampleText =
  "I write direct updates in short paragraphs. I say what changed and why it matters. I keep the tone warm, plain, and specific. I avoid filler and keep the next action obvious.";

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export function MockFlowWorkspace({ initialChecks }: { initialChecks: SetupCheck[] }) {
  const [text, setText] = useState(sampleText);
  const [directive, setDirective] = useState("Avoid sounding corporate.");
  const [checks, setChecks] = useState(initialChecks);
  const [ids, setIds] = useState<FlowIds>({});
  const [run, setRun] = useState<RunState | null>(null);
  const [events, setEvents] = useState<ApiRunEvent[]>([]);
  const [sourceType, setSourceType] = useState<"pasted_text" | "txt" | "md" | "pdf" | "docx">("pasted_text");
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("Ready for mock mode.");
  const [error, setError] = useState<string | null>(null);

  const canCreateProfile = Boolean(ids.writingId);
  const canCreateDataset = Boolean(ids.profileId);
  const canStartRun = Boolean(ids.datasetId);
  const latestMetrics = useMemo(() => events.at(-1)?.metrics ?? {}, [events]);

  async function runStep(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(null);
    }
  }

  async function refreshSetup() {
    await runStep("Refreshing setup", async () => {
      const status = await getJson<{ checks: SetupCheck[] }>("/api/setup/status");
      setChecks(status.checks);
      setMessage("Setup status refreshed.");
    });
  }

  async function loadSettings() {
    await runStep("Loading settings", async () => {
      const settings = await getJson<{ generatorModel: string; judgeModel: string; rayUnslothPath: string }>("/api/settings");
      setMessage(`Generator ${settings.generatorModel}; judge ${settings.judgeModel}; Ray-Unsloth ${settings.rayUnslothPath}.`);
    });
  }

  async function createWriting() {
    await runStep("Saving writing", async () => {
      const writing = await postJson<{ id: string }>("/api/writings", {
        title: "Mock writing sample",
        sourceType,
        text,
        modeTags: ["casual_message"],
        extractionWarnings,
      });
      setIds((current) => ({ ...current, writingId: writing.id }));
      setMessage("Writing sample saved.");
    });
  }

  async function extractUpload(file: File | null) {
    if (!file) return;
    await runStep("Extracting upload", async () => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/uploads/extract", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const extracted = (await response.json()) as ExtractedUpload;
      setText(extracted.text);
      setSourceType(extracted.sourceType);
      setExtractionWarnings(extracted.warnings);
      setMessage(`Extracted ${extracted.fileName}${extracted.warnings.length ? ` with ${extracted.warnings.length} warning(s).` : "."}`);
    });
  }

  async function createProfile() {
    if (!ids.writingId) return;
    await runStep("Generating profile", async () => {
      const profile = await postJson<{ id: string }>(
        "/api/profiles",
        {
          writingIds: [ids.writingId],
          userDirectives: directive.trim() ? [{ text: directive.trim() }] : [],
        },
      );
      await postJson(`/api/profiles/${profile.id}/approve`);
      setIds((current) => ({ ...current, profileId: profile.id }));
      setMessage("Mock style profile generated and approved.");
    });
  }

  async function createDataset() {
    if (!ids.profileId) return;
    await runStep("Generating dataset", async () => {
      const dataset = await postJson<{ id: string }>("/api/datasets", {
        profileId: ids.profileId,
        promptCount: 20,
        seed: 9,
      });
      await postJson(`/api/datasets/${dataset.id}/approve`);
      setIds((current) => ({ ...current, datasetId: dataset.id }));
      setMessage("Mock dataset generated and approved.");
    });
  }

  async function startRun() {
    if (!ids.datasetId) return;
    await runStep("Starting run", async () => {
      const nextRun = await postJson<RunState>("/api/runs", {
        datasetId: ids.datasetId,
        totalSteps: 2,
        mockMode: true,
      });
      setRun(nextRun);
      setIds((current) => ({ ...current, runId: nextRun.id }));
      setMessage("Mock worker started.");
      await pollRun(nextRun.id);
    });
  }

  async function pollRun(runId: string) {
    for (let index = 0; index < 8; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const runsPayload = await getJson<{ runs: RunState[] }>("/api/runs");
      const nextRun = runsPayload.runs.find((candidate) => candidate.id === runId);
      if (nextRun) setRun(nextRun);
      const eventsPayload = await getJson<{ events: ApiRunEvent[] }>(`/api/runs/${runId}/events`);
      setEvents(eventsPayload.events);
      if (nextRun && ["completed", "cancelled", "failed"].includes(nextRun.status)) {
        setMessage(`Run ${nextRun.status}.`);
        break;
      }
    }
  }

  async function startFullFlow() {
    await runStep("Running full flow", async () => {
      const writing = await postJson<{ id: string }>("/api/writings", {
        title: "Mock writing sample",
        sourceType: "pasted_text",
        text,
        modeTags: ["casual_message"],
      });
      const profile = await postJson<{ id: string }>("/api/profiles", {
        writingIds: [writing.id],
        userDirectives: directive.trim() ? [{ text: directive.trim() }] : [],
      });
      await postJson(`/api/profiles/${profile.id}/approve`);
      const dataset = await postJson<{ id: string }>("/api/datasets", {
        profileId: profile.id,
        promptCount: 20,
        seed: 9,
      });
      await postJson(`/api/datasets/${dataset.id}/approve`);
      const nextRun = await postJson<RunState>("/api/runs", {
        datasetId: dataset.id,
        totalSteps: 2,
        mockMode: true,
      });
      setIds({ writingId: writing.id, profileId: profile.id, datasetId: dataset.id, runId: nextRun.id });
      setRun(nextRun);
      setMessage("Full mock flow started.");
      await pollRun(nextRun.id);
    });
  }

  return (
    <section className="workspacePanel" id="workspace">
      <div className="sectionHeader workspaceHeader">
        <div>
          <p className="eyebrow">Mock workflow</p>
          <h2>Clickable local flow</h2>
        </div>
        <div className="workspaceActions">
          <button type="button" onClick={refreshSetup} disabled={Boolean(busy)}>
            <RefreshCw aria-hidden="true" />
            Refresh
          </button>
          <button type="button" onClick={loadSettings} disabled={Boolean(busy)}>
            <Settings aria-hidden="true" />
            Settings
          </button>
          <button type="button" className="primaryAction" onClick={startFullFlow} disabled={Boolean(busy)}>
            <Play aria-hidden="true" />
            Run full mock flow
          </button>
        </div>
      </div>

      <div className="workspaceGrid">
        <div className="flowEditor">
          <label htmlFor="writingUpload">Upload sample</label>
          <input
            id="writingUpload"
            type="file"
            accept=".txt,.md,.pdf,.docx"
            onChange={(event) => {
              void extractUpload(event.target.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
          {extractionWarnings.length ? (
            <div className="warningBox">
              {extractionWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}
          <label htmlFor="writingText">Writing sample</label>
          <textarea id="writingText" value={text} onChange={(event) => setText(event.target.value)} rows={7} />
          <label htmlFor="directiveText">Style directive</label>
          <input id="directiveText" value={directive} onChange={(event) => setDirective(event.target.value)} />
          <div className="stepButtons">
            <button type="button" onClick={createWriting} disabled={Boolean(busy) || !text.trim()}>
              <FileText aria-hidden="true" />
              Save writing
            </button>
            <button type="button" onClick={createProfile} disabled={Boolean(busy) || !canCreateProfile}>
              <Sparkles aria-hidden="true" />
              Profile
            </button>
            <button type="button" onClick={createDataset} disabled={Boolean(busy) || !canCreateDataset}>
              <Database aria-hidden="true" />
              Dataset
            </button>
            <button type="button" className="primaryAction" onClick={startRun} disabled={Boolean(busy) || !canStartRun}>
              <Play aria-hidden="true" />
              Train
            </button>
          </div>
        </div>

        <div className="flowStatus">
          <p className="statusLine">{busy ?? message}</p>
          {error ? <p className="errorLine">{error}</p> : null}
          <div className="artifactList">
            <span>Writing: {ids.writingId ?? "not created"}</span>
            <span>Profile: {ids.profileId ?? "not created"}</span>
            <span>Dataset: {ids.datasetId ?? "not created"}</span>
            <span>Run: {ids.runId ?? "not started"}</span>
          </div>
          <div className="runBox">
            <strong>{run ? `${run.status} · ${run.currentPhase}` : "No active run"}</strong>
            <span>{run ? `${run.completedSteps}/${run.totalSteps} steps` : "Start a mock run to see events."}</span>
            <span>Reward mean: {latestMetrics.reward_mean ?? latestMetrics.eval_reward_mean ?? "waiting"}</span>
            <span>Judge calls: {latestMetrics.judge_calls ?? "waiting"}</span>
          </div>
          <div className="eventList">
            {events.slice(-5).map((event, index) => (
              <p key={`${event.phase}-${event.step}-${index}`}>
                <strong>{event.phase}</strong> step {event.step}: {event.message}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div className="compactChecks">
        {checks.map((check) => (
          <span key={check.id} className={`compactCheck ${check.state}`}>
            {check.label}
          </span>
        ))}
      </div>
    </section>
  );
}
