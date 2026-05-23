"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const mdComponents: Components = {
  h1: (props) => <h1 className="mt-4 mb-2 text-base font-bold" {...props} />,
  h2: (props) => <h2 className="mt-4 mb-2 text-base font-bold" {...props} />,
  h3: (props) => <h3 className="mt-3 mb-1 text-sm font-bold" {...props} />,
  h4: (props) => <h4 className="mt-3 mb-1 text-sm font-semibold" {...props} />,
  p: (props) => <p className="my-2 leading-relaxed" {...props} />,
  ul: (props) => <ul className="my-2 ml-6 list-disc space-y-1" {...props} />,
  ol: (props) => <ol className="my-2 ml-6 list-decimal space-y-1" {...props} />,
  li: (props) => <li className="leading-relaxed" {...props} />,
  strong: (props) => <strong className="font-semibold" {...props} />,
  em: (props) => <em className="italic" {...props} />,
  a: (props) => (
    <a
      className="text-blue-600 underline hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "");
    return isBlock ? (
      <code className={`${className ?? ""} font-mono text-xs`} {...props}>
        {children}
      </code>
    ) : (
      <code
        className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-zinc-800"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: (props) => (
    <pre
      className="my-2 overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs leading-relaxed dark:bg-zinc-800"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="my-2 border-l-2 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-600 dark:text-zinc-400"
      {...props}
    />
  ),
  hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-700" />,
  table: (props) => (
    <div className="my-2 overflow-x-auto">
      <table className="border-collapse text-xs" {...props} />
    </div>
  ),
  th: (props) => (
    <th
      className="border border-zinc-300 px-2 py-1 text-left font-semibold dark:border-zinc-700"
      {...props}
    />
  ),
  td: (props) => (
    <td
      className="border border-zinc-300 px-2 py-1 align-top dark:border-zinc-700"
      {...props}
    />
  ),
};

let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: "default",
        securityLevel: "strict",
        fontFamily: "inherit",
      });
      return mod.default;
    });
  }
  return mermaidPromise;
}

function MermaidDiagram({
  code,
  streaming,
}: {
  code: string;
  streaming: boolean;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    if (streaming) {
      setSvg(null);
      setRenderError(null);
      return;
    }
    let cancelled = false;
    setRenderError(null);

    loadMermaid()
      .then(async (mermaid) => {
        if (cancelled) return;
        try {
          const id = `mermaid-${Math.random().toString(36).slice(2)}`;
          const result = await mermaid.render(id, code);
          if (cancelled) return;
          setSvg(result.svg);
        } catch (e) {
          if (cancelled) return;
          setSvg(null);
          setRenderError(e instanceof Error ? e.message : String(e));
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setSvg(null);
        setRenderError(e instanceof Error ? e.message : String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [code, streaming]);

  if (streaming || renderError) {
    return (
      <pre className="my-2 overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs leading-relaxed dark:bg-zinc-800">
        <code className="font-mono">{code}</code>
        {renderError && (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">
            Mermaid 描画失敗: {renderError}
          </div>
        )}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="my-2 rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-50 dark:text-zinc-600">
        図を描画中…
      </div>
    );
  }

  return (
    <div
      className="my-2 overflow-x-auto rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-50"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

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
              <MessageBubble
                key={i}
                message={m}
                streaming={streaming && i === messages.length - 1}
              />
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

function MessageBubble({
  message,
  streaming,
}: {
  message: Message;
  streaming: boolean;
}) {
  const isUser = message.role === "user";
  const hasReasoning = !isUser && message.reasoning && message.reasoning.length > 0;
  const hasContent = message.content.length > 0;

  const components = useMemo<Components>(
    () => ({
      ...mdComponents,
      pre: ({ children, ...props }) => {
        const child = children as
          | { props?: { className?: string; children?: unknown } }
          | undefined;
        const className = child?.props?.className ?? "";
        if (/language-mermaid/.test(className)) {
          const code = String(child?.props?.children ?? "").trim();
          return <MermaidDiagram code={code} streaming={streaming} />;
        }
        return (
          <pre
            className="my-2 overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs leading-relaxed dark:bg-zinc-800"
            {...props}
          >
            {children}
          </pre>
        );
      },
    }),
    [streaming],
  );

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
            <div className="mt-2 break-words italic">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {message.reasoning ?? ""}
              </ReactMarkdown>
            </div>
          </details>
        )}
        {hasContent ? (
          isUser ? (
            <div className="whitespace-pre-wrap break-words">{message.content}</div>
          ) : (
            <div className="break-words">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {message.content}
              </ReactMarkdown>
            </div>
          )
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
