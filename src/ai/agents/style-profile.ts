import { generateMockStyleProfile } from "@/lib/ai/mock/profile";
import { parseJsonFromText } from "@/ai/mastra/json";
import { generateGeminiText } from "@/ai/mastra/provider";
import type { Settings } from "@/lib/store/settings";
import { StyleProfileSchema, type StyleProfile, type UserDirective } from "@/lib/profiles/types";
import type { WritingRecord } from "@/lib/writings/store";
import { sha256Json } from "@/lib/store/hash";

export async function generateStyleProfileWithMastra(params: {
  settings: Settings;
  writings: WritingRecord[];
  userDirectives: UserDirective[];
}): Promise<StyleProfile> {
  if (params.settings.mockMode) {
    return generateMockStyleProfile({
      writings: params.writings,
      userDirectives: params.userDirectives,
      generatorModel: params.settings.generatorModel,
    });
  }

  const response = await generateGeminiText({
    settings: params.settings,
    model: params.settings.generatorModel,
    system: "You generate editable writing style profiles as strict JSON only.",
    prompt: JSON.stringify({
      task: "Generate a style profile with analytic and coachingRules sections.",
      requiredShape: {
        analytic: {
          sentenceLength: "string",
          punctuationHabits: "string",
          paragraphStructure: "string",
          diction: "string",
          readability: "string",
          modes: ["string"],
          sampleExcerpts: ["string"],
        },
        coachingRules: {
          prefer: ["string"],
          avoid: ["string"],
          preserve: ["string"],
          negativeRewardViolations: ["string"],
        },
      },
      userDirectives: params.userDirectives,
      writings: params.writings.map((writing) => ({
        id: writing.id,
        modeTags: writing.modeTags,
        text: writing.text,
      })),
    }),
  });
  const parsed = parseJsonFromText<Pick<StyleProfile, "analytic" | "coachingRules">>(response.text);
  const now = new Date().toISOString();
  const draft = {
    id: `profile_${Date.now()}`,
    version: 1,
    hash: "",
    status: "draft" as const,
    sourceWritingIds: params.writings.map((writing) => writing.id).sort(),
    userDirectives: params.userDirectives,
    analytic: parsed.analytic,
    coachingRules: parsed.coachingRules,
    generatorModel: params.settings.generatorModel,
    createdAt: now,
    updatedAt: now,
  };
  return StyleProfileSchema.parse({ ...draft, hash: sha256Json({ ...draft, hash: undefined }) });
}
