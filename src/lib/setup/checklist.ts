import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AppEnvironment } from "@/lib/config/env";
import { ACTIVE_TRAINING_CONFIG_FILE, ACTIVE_TRAINING_MODEL_LABEL } from "@/lib/training/config";

export type SetupCheck = {
  id: string;
  label: string;
  state: "ready" | "missing" | "available";
  detail: string;
};

export function getFirstRunChecklist(env: AppEnvironment): SetupCheck[] {
  const configPath = join(env.rayUnslothPath, "configs", ACTIVE_TRAINING_CONFIG_FILE);
  const sourcePath = join(env.rayUnslothPath, "src");

  return [
    {
      id: "groq-key",
      label: "Groq API key detected",
      state: env.groqApiKeyDetected ? "ready" : "missing",
      detail: env.groqApiKeyDetected ? "Environment key is present." : "Set GROQ_API_KEY for live AI jobs.",
    },
    {
      id: "mastra-models",
      label: "Mastra model config validated",
      state: "available",
      detail: `Generator ${env.generatorModel}; judge ${env.judgeModel}.`,
    },
    {
      id: "ray-unsloth-path",
      label: "Ray-Unsloth path found/importable",
      state: existsSync(sourcePath) ? "ready" : "missing",
      detail: sourcePath,
    },
    {
      id: "modal-config",
      label: "Modal configured",
      state: "available",
      detail: "Checked when a real training job starts.",
    },
    {
      id: "training-config",
      label: `${ACTIVE_TRAINING_MODEL_LABEL} config available`,
      state: existsSync(configPath) ? "ready" : "missing",
      detail: configPath,
    },
    {
      id: "data-dir",
      label: "Data directory initialized",
      state: "available",
      detail: ".voice-lab will be created on first write.",
    },
    {
      id: "mock-mode",
      label: "Mock mode available",
      state: env.mockModeAvailable ? "ready" : "missing",
      detail: "Deterministic local flows are available without API keys.",
    },
  ];
}
