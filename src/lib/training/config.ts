export const ACTIVE_TRAINING_CONFIG = "lfm2_5_1_2b_1x_l4_multitenant_rl";
export const ACTIVE_TRAINING_CONFIG_FILE = "lfm2_5_1_2b_1x_l4_multitenant_rl.yaml";
export const ACTIVE_TRAINING_MODEL = "lfm2.5-1.2b-instruct";
export const ACTIVE_TRAINING_MODEL_LABEL = "LFM2.5 1.2B Instruct";

export const LEGACY_TRAINING_CONFIGS = new Set(["qwen3_5_4b_1x_l4"]);

export function normalizeTrainingConfig(value: unknown) {
  if (typeof value === "string" && !LEGACY_TRAINING_CONFIGS.has(value)) {
    return value;
  }
  return ACTIVE_TRAINING_CONFIG;
}
