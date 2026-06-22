// llama-server (OpenAI 互換 /v1/chat/completions) 用の薄いクライアント。
//
// Tool calling ループは streaming=true で呼び出す。
// - プリフィル（入力処理）が長くても最初のトークンが来た時点で接続が維持される
// - トークンが届かなければ IDLE_TIMEOUT_MS でアボート → ハング検知
// GRILL 本流の /api/chat は upstream の SSE をそのまま proxy する別経路。

export type LlmMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ModelInfo = {
  modelName: string;
  nCtx: number;
};

const LLAMA_BASE_URL = process.env.LLAMA_BASE_URL ?? "http://localhost:8080";
const LLAMA_MODEL = process.env.LLAMA_MODEL ?? "gemma";
// トークンが届かない無音状態が続いた場合のタイムアウト（ハング検知用）。
// プリフィルが長くても最初のトークンが来れば延長されるので、
// 固定タイムアウトよりずっと長い時間に設定できる。
const IDLE_TIMEOUT_MS = Number(process.env.LLAMA_IDLE_TIMEOUT_MS ?? 120_000); // 2分

// ストリーミングで LLM を呼び出し、最終的な応答テキストを返す。
// onChunk が指定された場合はトークンごとに呼び出される。
// アイドルタイムアウトはトークンが届くたびにリセットされる。
export async function chatCompletion(
  messages: LlmMessage[],
  opts: { temperature?: number; onChunk?: (token: string) => void } = {},
): Promise<string> {
  // AbortController でアイドルタイムアウトを実装
  const ctrl = new AbortController();
  let idleTimer = setTimeout(() => ctrl.abort(new Error("LLM idle timeout")), IDLE_TIMEOUT_MS);
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ctrl.abort(new Error("LLM idle timeout")), IDLE_TIMEOUT_MS);
  };

  const res = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLAMA_MODEL,
      messages,
      temperature: opts.temperature ?? 0.3,
      stream: true,
    }),
    signal: ctrl.signal,
  }).catch((e) => {
    clearTimeout(idleTimer);
    throw e;
  });

  if (!res.ok || !res.body) {
    clearTimeout(idleTimer);
    const body = await res.text().catch(() => "");
    throw new Error(
      `llama-server failed (HTTP ${res.status}) at ${LLAMA_BASE_URL}: ` +
        body.slice(0, 200),
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdle();
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]" || !data) continue;
        try {
          const json = JSON.parse(data) as {
            choices?: { delta?: { content?: string }; finish_reason?: string }[];
          };
          const token = json.choices?.[0]?.delta?.content ?? "";
          if (token) {
            content += token;
            opts.onChunk?.(token);
          }
        } catch {
          // ignore malformed chunk
        }
      }
    }
  } finally {
    clearTimeout(idleTimer);
    reader.cancel().catch(() => {});
  }

  return content;
}

export async function getModelInfo(): Promise<ModelInfo> {
  try {
    const res = await fetch(`${LLAMA_BASE_URL}/v1/models`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error("models endpoint failed");
    const data = (await res.json()) as {
      data?: { id?: string; meta?: { n_ctx?: number } }[];
    };
    const model = data.data?.[0];
    return {
      modelName: model?.id ?? LLAMA_MODEL,
      nCtx: model?.meta?.n_ctx ?? 4096,
    };
  } catch {
    return { modelName: LLAMA_MODEL, nCtx: 4096 };
  }
}
