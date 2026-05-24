// llama-server (OpenAI 互換 /v1/chat/completions) 用の薄いクライアント。
//
// Tool calling ループ向けに **非ストリーミング** の completion を返す
// 関数だけ提供する。GRILL 本流の /api/chat は upstream の SSE をそのまま
// proxy する別経路なので、こちらとは責務が分かれている。

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const LLAMA_BASE_URL = process.env.LLAMA_BASE_URL ?? "http://localhost:8080";
const LLAMA_MODEL = process.env.LLAMA_MODEL ?? "gemma";

export async function chatCompletion(
  messages: LlmMessage[],
  opts: { temperature?: number } = {},
): Promise<string> {
  const res = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLAMA_MODEL,
      messages,
      temperature: opts.temperature ?? 0.3,
      stream: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `llama-server failed (HTTP ${res.status}) at ${LLAMA_BASE_URL}: ` +
        body.slice(0, 200),
    );
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}
