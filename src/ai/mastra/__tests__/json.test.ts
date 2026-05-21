import { describe, expect, it } from "vitest";
import { parseJsonFromText } from "@/ai/mastra/json";

describe("parseJsonFromText", () => {
  it("parses fenced JSON arrays", () => {
    const parsed = parseJsonFromText<{ id: number }[]>("```json\n[{\"id\": 1}]\n```");
    expect(parsed).toEqual([{ id: 1 }]);
  });

  it("extracts JSON embedded in prose", () => {
    const parsed = parseJsonFromText<{ ok: boolean }>("Here is the payload: {\"ok\": true}");
    expect(parsed).toEqual({ ok: true });
  });

  it("repairs truncated JSON arrays", () => {
    const parsed = parseJsonFromText<{ id: number }[]>(
      '[{"id": 1}, {"id": 2, "promptText": "unfinished',
    );
    expect(parsed).toEqual([{ id: 1 }]);
  });

  it("removes trailing commas before closing brackets", () => {
    const parsed = parseJsonFromText<{ items: string[] }>('{"items": ["a", "b",],}');
    expect(parsed).toEqual({ items: ["a", "b"] });
  });

  it("recovers complete objects before an invalid array tail", () => {
    const parsed = parseJsonFromText<{ id: number }[]>(
      '[{"id": 1}, {"id": 2, "text": "bad "quote"}, {"id": 3}]',
    );
    expect(parsed).toEqual([{ id: 1 }]);
  });
});
