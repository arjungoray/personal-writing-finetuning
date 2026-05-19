"use client";

import { useMemo, useState } from "react";
import { Database, Download, FileText, Play, RefreshCw, Settings, Sparkles, Trash2 } from "lucide-react";
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

type PlaygroundResult = {
  id: string;
  baseOutput: string;
  trainedAdapterOutput: string;
  scoreReport: {
    baseStyleScore: number;
    trainedStyleScore: number;
  };
};

type DatasetRecord = {
  id: string;
  split: "train" | "eval";
  taskType: string;
  promptText: string;
  approved: boolean;
};

type StyleProfile = {
  id: string;
  version: number;
  hash: string;
  analytic: {
    readability: string;
    diction: string;
  };
  coachingRules: {
    prefer: string[];
    avoid: string[];
  };
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
  const [playgroundPrompt, setPlaygroundPrompt] = useState("Rewrite this to sound more like me: Thanks for the update. I will review it and reply soon.");
  const [playgroundResults, setPlaygroundResults] = useState<PlaygroundResult[]>([]);
  const [datasetRecords, setDatasetRecords] = useState<DatasetRecord[]>([]);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [usageTotals, setUsageTotals] = useState<{ totalTokens: number; generatorCalls: number; judgeCalls: number } | null>(null);
  const [sourceType, setSourceType] = useState<"pasted_text" | "txt" | "md" | "pdf" | "docx">("pasted_text");
  const [extractionWarnings, setExtractionWarnings] = useState<string[]>([]);
  const [mockMode, setMockMode] = useState(true);
  const [smallSampleOverride, setSmallSampleOverride] = useState(false);
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
    await runStep("Validating settings", async () => {
      const settings = await getJson<{ generatorModel: string; judgeModel: string; rayUnslothPath: string; mockMode: boolean; smallSampleOverride: boolean }>("/api/settings");
      const usage = await getJson<{ totals: { totalTokens: number; generatorCalls: number; judgeCalls: number } }>("/api/usage");
      setUsageTotals(usage.totals);
      setMockMode(settings.mockMode);
      setSmallSampleOverride(settings.smallSampleOverride);
      const validation = await postJson<{ ok: boolean; mockMode: boolean; message?: string }>("/api/settings/validate");
      setMessage(`${validation.ok ? "Validated" : "Validation failed"}: generator ${settings.generatorModel}; judge ${settings.judgeModel}; ${validation.message ?? settings.rayUnslothPath}.`);
    });
  }

  async function updateSettingPatch(patch: { mockMode?: boolean; smallSampleOverride?: boolean }) {
    await runStep("Saving settings", async () => {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(await response.text());
      const settings = await response.json() as { mockMode: boolean; smallSampleOverride: boolean };
      setMockMode(settings.mockMode);
      setSmallSampleOverride(settings.smallSampleOverride);
      setMessage("Settings saved.");
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
      const approvedProfile = await getJson<StyleProfile>(`/api/profiles/${profile.id}`);
      setProfile(approvedProfile);
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
      const recordsPayload = await getJson<{ records: DatasetRecord[] }>(`/api/datasets/${dataset.id}/records`);
      setDatasetRecords(recordsPayload.records);
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
      const recordsPayload = await getJson<{ records: DatasetRecord[] }>(`/api/datasets/${dataset.id}/records`);
      const approvedProfile = await getJson<StyleProfile>(`/api/profiles/${profile.id}`);
      setProfile(approvedProfile);
      setDatasetRecords(recordsPayload.records);
      setRun(nextRun);
      setMessage("Full mock flow started.");
      await pollRun(nextRun.id);
    });
  }

  async function exportRun() {
    if (!ids.runId) return;
    await runStep("Exporting run", async () => {
      const exported = await postJson<{ exportDir: string }>(`/api/runs/${ids.runId}/export`);
      setMessage(`Run bundle exported to ${exported.exportDir}.`);
    });
  }

  async function runPlayground() {
    await runStep("Running playground", async () => {
      const result = await postJson<PlaygroundResult>("/api/playground", {
        prompt: playgroundPrompt,
        runId: ids.runId,
      });
      setPlaygroundResults((current) => [result, ...current]);
      setMessage("Playground comparison saved.");
    });
  }

  async function deletePlayground(id: string) {
    await runStep("Deleting playground result", async () => {
      const response = await fetch(`/api/playground/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await response.text());
      setPlaygroundResults((current) => current.filter((result) => result.id !== id));
      setMessage("Playground result deleted.");
    });
  }

  async function bulkApproveRecords() {
    if (!ids.datasetId) return;
    await runStep("Approving records", async () => {
      const payload = await postJson<{ records: DatasetRecord[] }>(`/api/datasets/${ids.datasetId}/records/bulk-approve`, {});
      setDatasetRecords(payload.records);
      setMessage("Dataset records approved.");
    });
  }

  async function regenerateRecord(recordId: string) {
    if (!ids.datasetId) return;
    await runStep("Regenerating record", async () => {
      const payload = await postJson<{ records: DatasetRecord[] }>(`/api/datasets/${ids.datasetId}/records/${recordId}/regenerate`);
      setDatasetRecords(payload.records);
      setMessage("Dataset record regenerated.");
    });
  }

  async function deleteRecord(recordId: string) {
    if (!ids.datasetId) return;
    await runStep("Deleting record", async () => {
      const payload = await postJson<{ records: DatasetRecord[] }>(`/api/datasets/${ids.datasetId}/records/${recordId}/delete`);
      setDatasetRecords(payload.records);
      setMessage("Dataset record deleted.");
    });
  }

  async function saveProfilePatch(patch: Partial<StyleProfile>) {
    if (!profile) return;
    await runStep("Saving profile", async () => {
      const response = await fetch(`/api/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(await response.text());
      setProfile(await response.json() as StyleProfile);
      setMessage("Profile saved and rehashed.");
    });
  }

  async function regenerateProfileSection(section: "analytic" | "coachingRules") {
    if (!profile) return;
    await runStep("Regenerating profile", async () => {
      const next = await postJson<StyleProfile>(`/api/profiles/${profile.id}/regenerate`, { section });
      setProfile(next);
      setMessage(`${section} regenerated.`);
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
          <div className="settingsStrip">
            <label>
              <input
                type="checkbox"
                checked={mockMode}
                onChange={(event) => void updateSettingPatch({ mockMode: event.currentTarget.checked })}
              />
              Mock mode
            </label>
            <label>
              <input
                type="checkbox"
                checked={smallSampleOverride}
                onChange={(event) => void updateSettingPatch({ smallSampleOverride: event.currentTarget.checked })}
              />
              Small-sample override
            </label>
          </div>
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
            <button type="button" onClick={exportRun} disabled={Boolean(busy) || !ids.runId || run?.status !== "completed"}>
              <Download aria-hidden="true" />
              Export
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
            <span>AI usage: {usageTotals ? `${usageTotals.totalTokens} tokens · ${usageTotals.generatorCalls} generator · ${usageTotals.judgeCalls} judge` : "not loaded"}</span>
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

      <div className="profileEditorPanel">
        <div className="sectionHeader reviewHeader">
          <div>
            <p className="eyebrow">Style profile</p>
            <h2>Editable profile</h2>
          </div>
          {profile ? <span className="profileHash">v{profile.version} · {profile.hash.slice(0, 10)}</span> : null}
        </div>
        {profile ? (
          <div className="profileEditorGrid">
            <div className="flowEditor">
              <label htmlFor="profileReadability">Analytic readability</label>
              <textarea
                id="profileReadability"
                value={profile.analytic.readability}
                rows={3}
                onChange={(event) => setProfile({ ...profile, analytic: { ...profile.analytic, readability: event.target.value } })}
              />
              <button type="button" onClick={() => void regenerateProfileSection("analytic")} disabled={Boolean(busy)}>
                <RefreshCw aria-hidden="true" />
                Regenerate analytic
              </button>
            </div>
            <div className="flowEditor">
              <label htmlFor="profilePrefer">Preferred rules</label>
              <textarea
                id="profilePrefer"
                value={profile.coachingRules.prefer.join("\n")}
                rows={3}
                onChange={(event) => setProfile({ ...profile, coachingRules: { ...profile.coachingRules, prefer: event.target.value.split("\n").filter(Boolean) } })}
              />
              <div className="stepButtons">
                <button type="button" onClick={() => void regenerateProfileSection("coachingRules")} disabled={Boolean(busy)}>
                  <RefreshCw aria-hidden="true" />
                  Regenerate rules
                </button>
                <button type="button" className="primaryAction" onClick={() => void saveProfilePatch({ analytic: profile.analytic, coachingRules: profile.coachingRules })} disabled={Boolean(busy)}>
                  Save profile
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="finePrint">Generate a profile to edit analytic traits and coaching rules.</p>
        )}
      </div>

      <div className="datasetReviewPanel">
        <div className="sectionHeader reviewHeader">
          <div>
            <p className="eyebrow">Dataset review</p>
            <h2>Prompt records</h2>
          </div>
          <button type="button" onClick={bulkApproveRecords} disabled={Boolean(busy) || !datasetRecords.length}>
            <Database aria-hidden="true" />
            Bulk approve
          </button>
        </div>
        <div className="recordList">
          {datasetRecords.length ? (
            datasetRecords.slice(0, 8).map((record) => (
              <div className="recordRow" key={record.id}>
                <div>
                  <strong>{record.taskType}</strong>
                  <span>{record.split} · {record.approved ? "approved" : "pending"}</span>
                  <p>{record.promptText}</p>
                </div>
                <div className="recordActions">
                  <button type="button" onClick={() => void regenerateRecord(record.id)} disabled={Boolean(busy)}>
                    <RefreshCw aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => void deleteRecord(record.id)} disabled={Boolean(busy)}>
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="finePrint">Generate a dataset to inspect prompt records.</p>
          )}
        </div>
      </div>

      <div className="playgroundPanel">
        <div className="sectionHeader">
          <p className="eyebrow">Playground</p>
          <h2>Base vs adapter mock comparison</h2>
        </div>
        <div className="playgroundGrid">
          <div className="flowEditor">
            <label htmlFor="playgroundPrompt">Prompt</label>
            <textarea id="playgroundPrompt" value={playgroundPrompt} onChange={(event) => setPlaygroundPrompt(event.target.value)} rows={4} />
            <button type="button" className="primaryAction" onClick={runPlayground} disabled={Boolean(busy) || !playgroundPrompt.trim()}>
              <Sparkles aria-hidden="true" />
              Compare outputs
            </button>
          </div>
          <div className="eventList">
            {playgroundResults.length ? (
              playgroundResults.map((result) => (
                <div className="playgroundResult" key={result.id}>
                  <button type="button" aria-label="Delete playground result" onClick={() => void deletePlayground(result.id)} disabled={Boolean(busy)}>
                    <Trash2 aria-hidden="true" />
                  </button>
                  <p><strong>Base {result.scoreReport.baseStyleScore}</strong>: {result.baseOutput}</p>
                  <p><strong>Adapter {result.scoreReport.trainedStyleScore}</strong>: {result.trainedAdapterOutput}</p>
                </div>
              ))
            ) : (
              <p>No playground results yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
