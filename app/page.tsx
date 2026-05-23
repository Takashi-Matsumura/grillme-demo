"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type Message,
  type Phase,
  PHASES,
  type ProjectMeta,
} from "@/app/lib/types";

const PHASE_LABELS: Record<Phase, string> = {
  "b-pre": "B-pre 準備",
  c: "C 伴走",
  "b-post": "B-post 整理",
};

const PHASE_HINTS: Record<Phase, string> = {
  "b-pre":
    "例: 「来週、人事課長に給与計算業務のヒアリングをします。準備を手伝ってください」",
  c:
    "例: 「今ミーティング中です。ここまでに次のことが分かりました：…。次に何を聞くべきでしょうか？」",
  "b-post":
    "例: 「ヒアリングが終わりました。以下のメモから業務文書（業務分掌 + フロー図）を作成してください：…」",
};

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

export default function Home() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<Phase>("b-pre");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshProjects = useCallback(async (): Promise<ProjectMeta[]> => {
    const res = await fetch("/api/projects");
    if (!res.ok) throw new Error("プロジェクト一覧の取得に失敗");
    const data = (await res.json()) as { projects: ProjectMeta[] };
    setProjects(data.projects);
    return data.projects;
  }, []);

  // Mount: load projects and auto-select most recent.
  useEffect(() => {
    refreshProjects()
      .then((list) => {
        if (list.length > 0) setCurrentSlug(list[0].slug);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [refreshProjects]);

  // When (slug, phase) changes, load that phase's conversation.
  useEffect(() => {
    if (!currentSlug) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoadingPhase(true);
    fetch(`/api/projects/${currentSlug}/${currentPhase}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`load failed: ${res.status}`);
        const data = (await res.json()) as {
          conversation: { messages: Message[] };
        };
        if (!cancelled) setMessages(data.conversation.messages);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setMessages([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPhase(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentSlug, currentPhase]);

  async function persistMessages(slug: string, phase: Phase, msgs: Message[]) {
    try {
      await fetch(`/api/projects/${slug}/${phase}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs }),
      });
    } catch {
      // surface to UI but don't crash
      setError("会話の保存に失敗しました（ローカル表示は維持）");
    }
  }

  async function handleCreateProject() {
    const name = window.prompt("業務名を入力してください（例: 月次給与計算）");
    if (!name || !name.trim()) return;
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `create failed: ${res.status}`);
      }
      const data = (await res.json()) as { project: ProjectMeta };
      await refreshProjects();
      setCurrentSlug(data.project.slug);
      setCurrentPhase("b-pre");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRenameProject() {
    if (!currentSlug || streaming) return;
    const current = projects.find((p) => p.slug === currentSlug);
    if (!current) return;
    const newName = window.prompt("新しい業務名を入力してください", current.name);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === current.name) return;
    try {
      const res = await fetch(`/api/projects/${currentSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `rename failed: ${res.status}`);
      }
      await refreshProjects();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteProject() {
    if (!currentSlug || streaming) return;
    const target = projects.find((p) => p.slug === currentSlug);
    if (!target) return;
    if (!window.confirm(`プロジェクト「${target.name}」を完全に削除しますか？`)) {
      return;
    }
    try {
      await fetch(`/api/projects/${currentSlug}`, { method: "DELETE" });
      const list = await refreshProjects();
      setCurrentSlug(list.length > 0 ? list[0].slug : null);
      setCurrentPhase("b-pre");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function send() {
    const trimmed = input.trim();
    if (!trimmed || streaming || !currentSlug) return;
    setError(null);

    const userMsg: Message = { role: "user", content: trimmed };
    const next = [...messages, userMsg];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    let finalMessages: Message[] = next;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          projectSlug: currentSlug,
          phase: currentPhase,
        }),
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

      finalMessages = [
        ...next,
        {
          role: "assistant",
          content: assistantContent,
          ...(assistantReasoning ? { reasoning: assistantReasoning } : {}),
        },
      ];

      // Auto-save the completed conversation so the user can't lose it.
      await persistMessages(currentSlug, currentPhase, finalMessages);
      await refreshProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages((msgs) => msgs.slice(0, -1));
    } finally {
      setStreaming(false);
    }
  }

  function downloadMarkdown() {
    if (!currentSlug) return;
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content.trim().length > 0);
    if (!lastAssistant) return;
    const projectName =
      projects.find((p) => p.slug === currentSlug)?.name ?? currentSlug;
    const phaseLabel = PHASE_LABELS[currentPhase];
    const today = new Date().toISOString().slice(0, 10);
    const filename = `${projectName}__${phaseLabel}__${today}.md`;

    const blob = new Blob([lastAssistant.content], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function reset() {
    if (streaming || !currentSlug) return;
    if (
      messages.length > 0 &&
      !window.confirm("このフェーズの会話を消去します。よろしいですか？")
    ) {
      return;
    }
    try {
      await fetch(`/api/projects/${currentSlug}/${currentPhase}`, {
        method: "DELETE",
      });
      setMessages([]);
      setError(null);
      await refreshProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const hasProject = currentSlug !== null;
  const canExport = messages.some(
    (m) => m.role === "assistant" && m.content.trim().length > 0,
  );

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                ops-grill チャット
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                ローカル LLM (llama.cpp) を使った業務分析グリルのデモ
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={currentSlug ?? ""}
                onChange={(e) => {
                  setCurrentSlug(e.target.value || null);
                  setCurrentPhase("b-pre");
                }}
                disabled={streaming || projects.length === 0}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
              >
                {projects.length === 0 && (
                  <option value="">プロジェクト未作成</option>
                )}
                {projects.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreateProject}
                disabled={streaming}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                + 新規
              </button>
              <button
                onClick={handleRenameProject}
                disabled={streaming || !hasProject}
                title="プロジェクト名を変更"
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                リネーム
              </button>
              <button
                onClick={handleDeleteProject}
                disabled={streaming || !hasProject}
                title="プロジェクト削除"
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                削除
              </button>
            </div>
          </div>
          {hasProject && (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-800">
                {PHASES.map((p) => (
                  <button
                    key={p}
                    onClick={() => setCurrentPhase(p)}
                    disabled={streaming || p === currentPhase}
                    className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                      p === currentPhase
                        ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100"
                        : "text-zinc-600 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:text-zinc-100"
                    }`}
                  >
                    {PHASE_LABELS[p]}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadMarkdown}
                  disabled={streaming || !canExport}
                  title="このフェーズの最新の応答を Markdown としてダウンロード"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  📥 Markdown
                </button>
                <button
                  onClick={reset}
                  disabled={streaming || messages.length === 0}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  このフェーズを消去
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
        {!hasProject ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-zinc-500 dark:text-zinc-400">
            <p className="text-sm">
              まずプロジェクト（業務）を作成してください。
            </p>
            <p className="mt-2 text-xs">
              右上の「+ 新規」から業務名を入力すると、B-pre / C / B-post
              の各フェーズが永続化されます。
            </p>
          </div>
        ) : loadingPhase ? (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            読み込み中…
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-zinc-500 dark:text-zinc-400">
            <p className="text-sm">
              {PHASE_LABELS[currentPhase]} を始めましょう。
            </p>
            <p className="mt-2 text-xs">{PHASE_HINTS[currentPhase]}</p>
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
            placeholder={
              hasProject
                ? "メッセージを入力 (Cmd/Ctrl + Enter で送信)"
                : "先にプロジェクトを作成してください"
            }
            rows={3}
            disabled={streaming || !hasProject}
            className="flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim() || !hasProject}
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
