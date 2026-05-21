import { sha256Json } from "@/lib/store/hash";
import type { StyleProfile, UserDirective } from "@/lib/profiles/types";
import type { WritingRecord } from "@/lib/writings/store";

function averageWordsPerSentence(text: string) {
  const sentences = text.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 0);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return sentences.length ? Math.round(words / sentences.length) : words;
}

export function generateMockStyleProfile(params: {
  writings: WritingRecord[];
  userDirectives: UserDirective[];
  generatorModel: string;
}): StyleProfile {
  const now = new Date().toISOString();
  const allText = params.writings.map((writing) => writing.text).join("\n\n");
  const avgSentence = averageWordsPerSentence(allText);
  const modes = Array.from(new Set(params.writings.flatMap((writing) => writing.modeTags))).sort();
  const sampleExcerpts = params.writings
    .map((writing) => writing.text.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 5);

  const draft = {
    id: `profile_${Date.now()}`,
    version: 1,
    hash: "",
    status: "draft" as const,
    sourceWritingIds: params.writings.map((writing) => writing.id).sort(),
    userDirectives: params.userDirectives,
    analytic: {
      sentenceLength: `Average sentence length is about ${avgSentence} words in the approved corpus.`,
      punctuationHabits: "Use observed punctuation from the corpus as the reference distribution; avoid adding showy punctuation not present in samples.",
      paragraphStructure: "Prefer paragraph lengths and breaks similar to reviewed samples.",
      diction: "Prefer words and transitions that recur in the user's reviewed writing.",
      readability: "Keep clarity high while preserving the user's sentence rhythm.",
      modes: modes.length ? modes : ["casual_message"],
      sampleExcerpts,
    },
    coachingRules: {
      prefer: ["Preserve meaning before adding style.", "Use the user's observed paragraph cadence.", ...params.userDirectives.map((directive) => directive.text)],
      avoid: ["Do not copy reference excerpts.", "Do not mimic typos unless explicitly directed.", "Do not add training or debugging chatter."],
      preserve: ["Intent", "Required format", "Specific factual details"],
      negativeRewardViolations: ["generic corporate tone", "hidden-reference copying", "format drift", "meta-commentary"],
    },
    generatorModel: params.generatorModel,
    createdAt: now,
    updatedAt: now,
  };

  return { ...draft, hash: sha256Json({ ...draft, hash: undefined }) };
}
