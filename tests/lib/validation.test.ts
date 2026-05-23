import { describe, expect, it } from "vitest";
import {
  MAX_CONTENT_CHARS,
  MAX_MESSAGES,
  MAX_REASONING_CHARS,
  validateMessages,
} from "@/app/lib/validation";

describe("validateMessages", () => {
  it("accepts a minimal user message", () => {
    const result = validateMessages([{ role: "user", content: "hi" }]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages).toEqual([{ role: "user", content: "hi" }]);
    }
  });

  it("rejects non-array bodies", () => {
    const result = validateMessages("not an array");
    expect(result).toEqual({
      ok: false,
      error: "messages must be an array",
      status: 400,
    });
  });

  it("rejects empty arrays", () => {
    expect(validateMessages([])).toMatchObject({
      ok: false,
      status: 400,
    });
  });

  it("rejects more than MAX_MESSAGES with 413", () => {
    const messages = Array.from({ length: MAX_MESSAGES + 1 }, () => ({
      role: "user" as const,
      content: "x",
    }));
    expect(validateMessages(messages)).toMatchObject({
      ok: false,
      status: 413,
    });
  });

  it("rejects invalid role with 400", () => {
    expect(
      validateMessages([{ role: "hacker", content: "x" }]),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects non-string content with 400", () => {
    expect(
      validateMessages([{ role: "user", content: 123 }]),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects content over MAX_CONTENT_CHARS with 413", () => {
    expect(
      validateMessages([
        { role: "user", content: "x".repeat(MAX_CONTENT_CHARS + 1) },
      ]),
    ).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects reasoning over MAX_REASONING_CHARS with 413", () => {
    expect(
      validateMessages([
        {
          role: "assistant",
          content: "ok",
          reasoning: "x".repeat(MAX_REASONING_CHARS + 1),
        },
      ]),
    ).toMatchObject({ ok: false, status: 413 });
  });

  it("preserves valid reasoning", () => {
    const result = validateMessages([
      { role: "assistant", content: "ok", reasoning: "thinking..." },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages[0].reasoning).toBe("thinking...");
    }
  });

  it("drops null reasoning silently", () => {
    const result = validateMessages([
      { role: "assistant", content: "ok", reasoning: null },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.messages[0].reasoning).toBeUndefined();
    }
  });
});
