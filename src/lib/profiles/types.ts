import { z } from "zod";

export const UserDirectiveSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
});

export const StyleProfileSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  hash: z.string(),
  status: z.enum(["draft", "approved"]),
  sourceWritingIds: z.array(z.string()),
  userDirectives: z.array(UserDirectiveSchema),
  analytic: z.object({
    sentenceLength: z.string(),
    punctuationHabits: z.string(),
    paragraphStructure: z.string(),
    diction: z.string(),
    readability: z.string(),
    modes: z.array(z.string()),
    sampleExcerpts: z.array(z.string()),
  }),
  coachingRules: z.object({
    prefer: z.array(z.string()),
    avoid: z.array(z.string()),
    preserve: z.array(z.string()),
    negativeRewardViolations: z.array(z.string()),
  }),
  generatorModel: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type UserDirective = z.infer<typeof UserDirectiveSchema>;
export type StyleProfile = z.infer<typeof StyleProfileSchema>;
