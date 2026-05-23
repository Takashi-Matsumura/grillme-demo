export const MAX_MESSAGES = 200;
export const MAX_CONTENT_CHARS = 50_000;
export const MAX_REASONING_CHARS = 200_000;

export type ValidatedMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
};

export type ValidationOk = { ok: true; messages: ValidatedMessage[] };
export type ValidationErr = { ok: false; error: string; status: number };
export type MessageValidationResult = ValidationOk | ValidationErr;

export function validateMessages(raw: unknown): MessageValidationResult {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "messages must be an array", status: 400 };
  }
  if (raw.length === 0) {
    return { ok: false, error: "messages required", status: 400 };
  }
  if (raw.length > MAX_MESSAGES) {
    return {
      ok: false,
      error: `too many messages (max ${MAX_MESSAGES})`,
      status: 413,
    };
  }

  const validated: ValidatedMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") {
      return { ok: false, error: "invalid message", status: 400 };
    }
    const obj = m as Record<string, unknown>;
    if (
      obj.role !== "user" &&
      obj.role !== "assistant" &&
      obj.role !== "system"
    ) {
      return { ok: false, error: "invalid message.role", status: 400 };
    }
    if (typeof obj.content !== "string") {
      return { ok: false, error: "invalid message.content", status: 400 };
    }
    if (obj.content.length > MAX_CONTENT_CHARS) {
      return {
        ok: false,
        error: `message.content too long (max ${MAX_CONTENT_CHARS} chars)`,
        status: 413,
      };
    }
    let reasoning: string | undefined;
    if (obj.reasoning !== undefined && obj.reasoning !== null) {
      if (typeof obj.reasoning !== "string") {
        return {
          ok: false,
          error: "invalid message.reasoning",
          status: 400,
        };
      }
      if (obj.reasoning.length > MAX_REASONING_CHARS) {
        return {
          ok: false,
          error: `message.reasoning too long (max ${MAX_REASONING_CHARS} chars)`,
          status: 413,
        };
      }
      reasoning = obj.reasoning;
    }
    validated.push({
      role: obj.role,
      content: obj.content,
      ...(reasoning ? { reasoning } : {}),
    });
  }
  return { ok: true, messages: validated };
}
