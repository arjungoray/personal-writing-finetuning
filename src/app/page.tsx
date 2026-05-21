import { Brain, Database, FileText, Gauge, Play, SlidersHorizontal } from "lucide-react";
import { FirstRunChecklist } from "@/components/first-run-checklist";
import { MockFlowWorkspace } from "@/components/workspace/mock-flow";
import { getAppEnvironment } from "@/lib/config/env";
import { MODAL_PRICING } from "@/lib/pricing/modal";
import { getFirstRunChecklist } from "@/lib/setup/checklist";
import { ACTIVE_TRAINING_MODEL, ACTIVE_TRAINING_MODEL_LABEL } from "@/lib/training/config";

const pipeline = [
  { label: "Upload", detail: "Paste text or extract readable documents.", icon: FileText },
  { label: "Profile", detail: "Generate, edit, approve, and version style rules.", icon: Brain },
  { label: "Dataset", detail: "Freeze JSONL RL prompt versions with provenance.", icon: Database },
  { label: "Train", detail: "Launch Ray-Unsloth jobs and inspect reward internals.", icon: Play },
];

export default function Home() {
  const env = getAppEnvironment();
  const checks = getFirstRunChecklist(env);

  return (
    <main className="appShell">
      <nav className="topNav" aria-label="Primary">
        <div>
          <p className="brandKicker">Voice Lab</p>
          <h1>Writing fine-tuning workspace</h1>
        </div>
        <div className="navActions">
          <a className="iconButton" href="#workspace" aria-label="Settings">
            <SlidersHorizontal aria-hidden="true" />
          </a>
          <a className="buttonLike primaryAction" href="#workspace">
            <Play aria-hidden="true" />
            Start flow
          </a>
        </div>
      </nav>

      <section className="heroBand">
        <div className="heroCopy">
          <p className="eyebrow">Local, single-user, mockable</p>
          <h2>Build a reviewed style profile, freeze an RL dataset, and watch training mechanics directly.</h2>
          <p>
            V1 targets the active Ray-Unsloth {ACTIVE_TRAINING_MODEL_LABEL} L4 config while keeping model and config selection explicit for future expansion.
          </p>
        </div>
        <div className="modelPanel">
          <div className="modelRow">
            <span>Active model</span>
            <strong>{ACTIVE_TRAINING_MODEL}</strong>
          </div>
          <div className="modelRow">
            <span>Generator</span>
            <strong>{env.generatorModel}</strong>
          </div>
          <div className="modelRow">
            <span>Judge</span>
            <strong>{env.judgeModel}</strong>
          </div>
        </div>
      </section>

      <section className="pipelineGrid" aria-label="Workflow">
        {pipeline.map((item) => (
          <article className="pipelineItem" key={item.label}>
            <item.icon aria-hidden="true" />
            <h3>{item.label}</h3>
            <p>{item.detail}</p>
          </article>
        ))}
      </section>

      <MockFlowWorkspace initialChecks={checks} />

      <div className="contentGrid">
        <FirstRunChecklist checks={checks} />
        <section className="panel">
          <div className="sectionHeader">
            <p className="eyebrow">Cost reference</p>
            <h2>Modal GPU estimate</h2>
          </div>
          <div className="rateList">
            {MODAL_PRICING.gpuRates.map((rate) => (
              <div className="rateRow" key={rate.gpu}>
                <span>{rate.gpu}</span>
                <strong>${rate.dollarsPerHour.toFixed(4)}/hr</strong>
              </div>
            ))}
          </div>
          <p className="finePrint">
            Last verified {MODAL_PRICING.lastVerified} from{" "}
            <a href={MODAL_PRICING.sourceUrl}>Modal pricing</a>. GPU and LLM usage will be tracked separately during runs.
          </p>
        </section>
      </div>

      <section className="panel metricsPanel">
        <div className="sectionHeader">
          <p className="eyebrow">Progress preview</p>
          <h2>Training observability surface</h2>
        </div>
        <div className="metricGrid">
          {["Reward mean", "Judge calls", "Cache hit rate", "Degenerate groups", "Advantage std", "Policy logprob"].map((metric) => (
            <div className="metricTile" key={metric}>
              <Gauge aria-hidden="true" />
              <span>{metric}</span>
              <strong>Waiting</strong>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
