export const DEFAULT_GENERATOR_MODEL = "gemini-3-flash-preview";
export const DEFAULT_JUDGE_MODEL = "gemini-3-flash-preview";
export const DEFAULT_RAY_UNSLOTH_PATH = "/Users/arjungoray/Developer/Ray-Unsloth";

export type AppEnvironment = {
  geminiApiKeyDetected: boolean;
  generatorModel: string;
  judgeModel: string;
  rayUnslothPath: string;
  mockModeAvailable: boolean;
};

export function getAppEnvironment(): AppEnvironment {
  return {
    geminiApiKeyDetected: Boolean(process.env.GEMINI_API_KEY),
    generatorModel: process.env.GENERATOR_MODEL ?? DEFAULT_GENERATOR_MODEL,
    judgeModel: process.env.JUDGE_MODEL ?? DEFAULT_JUDGE_MODEL,
    rayUnslothPath: process.env.RAY_UNSLOTH_PATH ?? DEFAULT_RAY_UNSLOTH_PATH,
    mockModeAvailable: true,
  };
}
