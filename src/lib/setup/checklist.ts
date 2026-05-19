import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AppEnvironment } from "@/lib/config/env";

export type SetupCheck = {
  id: string;
  label: string;
  state: "ready" | "missing" | "available";
  detail: string;
};

export function getFirstRunChecklist(env: AppEnvironment): SetupCheck[] {
  const configPath = join(env.rayUnslothPath, "configs", "qwen3_5_4b_1x_l4.yaml");
  const sourcePath = join(env.rayUnslothPath, "src");

  return [
    {
      id: "gemini-key",
      label: "Gemini API key detected",
      state: env.geminiApiKeyDetected ? "ready" : "missing",
      detail: env.geminiApiKeyDetected ? "Environment key is present." : "Set GEMINI_API_KEY for live AI jobs.",
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
      id: "qwen-config",
      label: "4B config available",
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
