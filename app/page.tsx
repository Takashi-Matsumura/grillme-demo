"use client";

import { useEffect, useRef, useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;
    setError(null);

    const userMsg: Message = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let assistantReasoning = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]" || !data) continue;
          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta ?? {};
            let changed = false;
            if (typeof delta.content === "string" && delta.content.length > 0) {
              assistantContent += delta.content;
              changed = true;
            }
            if (
              typeof delta.reasoning_content === "string" &&
              delta.reasoning_content.length > 0
            ) {
              assistantReasoning += delta.reasoning_content;
              changed = true;
            }
            if (changed) {
              setMessages((msgs) => {
                const copy = [...msgs];
                copy[copy.length - 1] = {
                  role: "assistant",
                  content: assistantContent,
                  reasoning: assistantReasoning || undefined,
                };
                return copy;
              });
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((msgs) => msgs.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  function reset() {
    if (streaming) return;
    setMessages([]);
    setError(null);
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              ops-grill チャット
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              ローカル LLM (llama.cpp) を使った業務分析グリルのデモ
            </p>
          </div>
          <button
            onClick={reset}
            disabled={streaming || messages.length === 0}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            会話をクリア
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-zinc-500 dark:text-zinc-400">
            <p className="text-sm">業務分析グリルを始めましょう。</p>
            <p className="mt-2 text-xs">
              例: 「来週、人事課長に給与計算業務のヒアリングをします。準備を手伝ってください」
            </p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <strong>エラー:</strong> {error}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mt-6 flex gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="メッセージを入力 (Cmd/Ctrl + Enter で送信)"
            rows={3}
            disabled={streaming}
            className="flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="self-end rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {streaming ? "送信中…" : "送信"}
          </button>
        </form>
      </main>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const hasReasoning = !isUser && message.reasoning && message.reasoning.length > 0;
  const hasContent = message.content.length > 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[85%] flex-col gap-2 rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800"
        }`}
      >
        {hasReasoning && (
          <details className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <summary className="cursor-pointer select-none font-medium">
              {hasContent ? "思考プロセス" : "考え中..."}
            </summary>
            <div className="mt-2 whitespace-pre-wrap break-words italic">
              {message.reasoning}
            </div>
          </details>
        )}
        {hasContent ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          !hasReasoning && (
            <span className="inline-flex gap-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:150ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400 [animation-delay:300ms]" />
            </span>
          )
        )}
      </div>
    </div>
  );
}
