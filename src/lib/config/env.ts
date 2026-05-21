export const DEFAULT_GENERATOR_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
export const DEFAULT_JUDGE_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
export const DEFAULT_RAY_UNSLOTH_PATH = "/Users/arjungoray/Developer/ray-unsloth";

export type AppEnvironment = {
  groqApiKeyDetected: boolean;
  generatorModel: string;
  judgeModel: string;
  rayUnslothPath: string;
  mockModeAvailable: boolean;
};

export function getAppEnvironment(): AppEnvironment {
  return {
    groqApiKeyDetected: Boolean(process.env.GROQ_API_KEY),
    generatorModel: process.env.GENERATOR_MODEL ?? DEFAULT_GENERATOR_MODEL,
    judgeModel: process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL,
    rayUnslothPath: process.env.RAY_UNSLOTH_PATH ?? DEFAULT_RAY_UNSLOTH_PATH,
    mockModeAvailable: true,
  };
}
