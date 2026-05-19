import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockFlowWorkspace } from "@/components/workspace/mock-flow";

function jsonResponse(value: unknown, ok = true) {
  return {
    ok,
    json: async () => value,
    text: async () => JSON.stringify(value),
  } as Response;
}

describe("MockFlowWorkspace", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/settings") {
        return jsonResponse({
          generatorModel: "gemini-3-flash-preview",
          judgeModel: "gemini-3-flash-preview",
          rayUnslothPath: "/tmp/Ray-Unsloth",
          mockMode: true,
          smallSampleOverride: false,
        });
      }
      if (url === "/api/settings/validate") {
        return jsonResponse({ ok: true, mockMode: true, message: "Mock mode is enabled." });
      }
      if (url === "/api/writings") return jsonResponse({ id: "writing_1" });
      if (url === "/api/profiles") return jsonResponse({ id: "profile_1" });
      if (url === "/api/profiles/profile_1/approve") return jsonResponse({ id: "profile_1" });
      if (url === "/api/profiles/profile_1") {
        return jsonResponse({
          id: "profile_1",
          version: 1,
          hash: "abcdef123456",
          analytic: { readability: "Clear", diction: "Direct" },
          coachingRules: { prefer: ["Be specific"], avoid: ["Filler"] },
        });
      }
      if (url === "/api/datasets") return jsonResponse({ id: "dataset_1" });
      if (url === "/api/datasets/dataset_1/approve") return jsonResponse({ id: "dataset_1" });
      if (url === "/api/datasets/dataset_1/records") {
        return jsonResponse({
          records: [
            {
              id: "record_1",
              split: "train",
              taskType: "rewrite_in_my_voice",
              promptText: "Rewrite this.",
              approved: false,
            },
          ],
        });
      }
      if (url === "/api/runs") {
        return jsonResponse({
          id: "run_1",
          status: "completed",
          completedSteps: 2,
          totalSteps: 2,
          currentPhase: "completed",
        });
      }
      if (url === "/api/runs/run_1/events") {
        return jsonResponse({ events: [{ phase: "eval", step: 2, message: "done", metrics: { eval_reward_mean: 0.5 } }] });
      }
      return jsonResponse({});
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("validates settings when the settings button is clicked", async () => {
    render(<MockFlowWorkspace initialChecks={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByText(/Validated:/)).toBeInTheDocument();
  });

  it("runs the full mock flow and shows dataset records", async () => {
    render(<MockFlowWorkspace initialChecks={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Run full mock flow" }));

    await waitFor(() => expect(screen.getByText("rewrite_in_my_voice")).toBeInTheDocument());
    expect(screen.getByText("completed · completed")).toBeInTheDocument();
  });
});
