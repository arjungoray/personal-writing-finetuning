import { generateMockDatasetRecords } from "@/lib/ai/mock/dataset";
import { parseJsonFromText } from "@/ai/mastra/json";
import { generateGeminiText } from "@/ai/mastra/provider";
import { DatasetPromptRecordSchema, type DatasetPromptRecord } from "@/lib/datasets/types";
import type { StyleProfile } from "@/lib/profiles/types";
import type { Settings } from "@/lib/store/settings";
import type { WritingRecord } from "@/lib/writings/store";

export async function generateDatasetRecordsWithMastra(params: {
  settings: Settings;
  profile: StyleProfile;
  writings: WritingRecord[];
  promptCount: number;
  seed: number;
  timestamp: string;
}): Promise<DatasetPromptRecord[]> {
  if (params.settings.mockMode) {
    return generateMockDatasetRecords({
      profile: params.profile,
      writings: params.writings,
      promptCount: params.promptCount,
      seed: params.seed,
      generatorModel: params.settings.generatorModel,
      timestamp: params.timestamp,
    });
  }

  const response = await generateGeminiText({
    settings: params.settings,
    kind: "generator",
    model: params.settings.generatorModel,
    system: "You generate RL prompt datasets as strict JSON arrays only. Do not include reference excerpts in promptText.",
    prompt: JSON.stringify({
      profile: params.profile,
      promptCount: params.promptCount,
      seed: params.seed,
      taskMix: "35 rewrite, 25 bullets, 15 clarity, 10 tone, 10 email, 5 summarize/expand",
      writings: params.writings.map((writing) => ({
        textHash: writing.textHash,
        modeTags: writing.modeTags,
        excerpt: writing.text.slice(0, 500),
      })),
      requiredRecordFields: [
        "id",
        "split",
        "taskType",
        "writingModeTags",
        "promptText",
        "selectedReferenceExcerptIds",
        "expectedTraits",
        "negativeCriteria",
      ],
    }),
  });

  const parsed = parseJsonFromText<unknown[]>(response.text);
  return parsed.map((record, index) =>
    DatasetPromptRecordSchema.parse({
      ...(record as Record<string, unknown>),
      split: index % 5 === 0 ? "eval" : "train",
      profileVersionHash: params.profile.hash,
      generatorModel: params.settings.generatorModel,
      generationSeed: params.seed,
      generationTimestamp: params.timestamp,
      approved: false,
    }),
  );
}
