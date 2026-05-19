export type CorpusPolicy = {
  wordCount: number;
  canGenerateDataset: boolean;
  canTrain: boolean;
  warning: string | null;
  blockedReason: string | null;
};

export function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function evaluateCorpusPolicy(text: string, smallSampleOverride: boolean): CorpusPolicy {
  const wordCount = countWords(text);
  const belowTrainingMinimum = wordCount < 1000;

  return {
    wordCount,
    canGenerateDataset: wordCount >= 1000,
    canTrain: !belowTrainingMinimum || smallSampleOverride,
    warning:
      wordCount >= 1000 && wordCount < 3000
        ? "Style estimates may be unstable below 3,000 words."
        : wordCount >= 5000
          ? "Preferred corpus size reached."
          : null,
    blockedReason:
      belowTrainingMinimum && !smallSampleOverride
        ? "Training is blocked below 1,000 words unless the unsafe small-sample override is enabled."
        : null,
  };
}
