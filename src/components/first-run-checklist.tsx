import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import type { SetupCheck } from "@/lib/setup/checklist";

const stateStyles = {
  ready: "statusReady",
  missing: "statusMissing",
  available: "statusAvailable",
} as const;

function CheckIcon({ state }: { state: SetupCheck["state"] }) {
  if (state === "ready") return <CheckCircle2 aria-hidden="true" />;
  if (state === "missing") return <CircleAlert aria-hidden="true" />;
  return <CircleDashed aria-hidden="true" />;
}

export function FirstRunChecklist({ checks }: { checks: SetupCheck[] }) {
  return (
    <section className="panel">
      <div className="sectionHeader">
        <p className="eyebrow">First-run setup</p>
        <h2>Local readiness</h2>
      </div>
      <div className="checkList">
        {checks.map((check) => (
          <div className="checkRow" key={check.id}>
            <div className={`checkIcon ${stateStyles[check.state]}`}>
              <CheckIcon state={check.state} />
            </div>
            <div>
              <p className="checkLabel">{check.label}</p>
              <p className="checkDetail">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
