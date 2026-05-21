import { z } from "zod";

export const RunStatusSchema = z.enum(["queued", "running", "cancel_requested", "cancelled", "completed", "failed"]);

export const RunStateSchema = z.object({
  id: z.string(),
  datasetId: z.string(),
  status: RunStatusSchema,
  pid: z.number().int().positive().nullable(),
  mockMode: z.boolean(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  completedSteps: z.number().int().nonnegative(),
  totalSteps: z.number().int().positive(),
  currentPhase: z.string(),
  trainingSeed: z.number().int().nonnegative(),
  checkpointInterval: z.number().int().positive(),
  error: z.string().nullable(),
});

export const RunEventSchema = z.object({
  runId: z.string(),
  timestamp: z.string(),
  phase: z.string(),
  step: z.number().int().nonnegative(),
  message: z.string(),
  metrics: z.record(z.number()).default({}),
});

export type RunState = z.infer<typeof RunStateSchema>;
export type RunEvent = z.infer<typeof RunEventSchema>;
