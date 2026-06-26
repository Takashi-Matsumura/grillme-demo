"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookOpen, Download, Pencil, Printer, PlusCircle } from "lucide-react";
import { DomainResearchModal } from "@/app/components/DomainResearchModal";
import type { DomainKnowledge } from "@/app/lib/domain-knowledge";
import {
  type ArchivedSession,
  type Message,
  type Phase,
  PHASES,
  type ProjectMeta,
  type SessionMeta,
} from "@/app/lib/types";

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

const PHASE_LABELS: Record<Phase, string> = {
  "b-pre": "① ヒアリング前準備",
  c: "② ヒアリング中の伴走",
  "b-post": "③ ヒアリング後の整理",
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
  // Track the rendered output along with the code it was rendered FOR.
  // When `code` changes, the existing state is treated as stale and we
  // re-render — no need to manually clear state in an effect.
  const [render, setRender] = useState<{
    for: string;
    svg?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    if (streaming) return;
    let cancelled = false;
    loadMermaid()
      .then(async (mermaid) => {
        if (cancelled) return;
        try {
          const id = `mermaid-${Math.random().toString(36).slice(2)}`;
          const result = await mermaid.render(id, code);
          if (cancelled) return;
          setRender({ for: code, svg: result.svg });
        } catch (e) {
          if (cancelled) return;
          setRender({
            for: code,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setRender({
          for: code,
          error: e instanceof Error ? e.message : String(e),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [code, streaming]);

  const fresh = render?.for === code ? render : null;

  if (streaming || fresh?.error) {
    return (
      <pre className="my-2 overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs leading-relaxed dark:bg-zinc-800">
        <code className="font-mono">{code}</code>
        {fresh?.error && (
          <div className="mt-2 text-xs text-red-600 dark:text-red-400">
            Mermaid 描画失敗: {fresh.error}
          </div>
        )}
      </pre>
    );
  }

  if (!fresh?.svg) {
    return (
      <div className="my-2 rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-50 dark:text-zinc-600">
        図を描画中…
      </div>
    );
  }

  return (
    <div
      className="my-2 overflow-x-auto rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-50"
      dangerouslySetInnerHTML={{ __html: fresh.svg }}
    />
  );
}

const refPanelComponents: Components = {
  ...mdComponents,
  pre: ({ children }) => {
    const child = children as
      | { props?: { className?: string; children?: unknown } }
      | undefined;
    const className = child?.props?.className ?? "";
    if (/language-mermaid/.test(className)) {
      const code = String(child?.props?.children ?? "").trim();
      return <MermaidDiagram code={code} streaming={false} />;
    }
    return (
      <pre className="my-2 overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs leading-relaxed dark:bg-zinc-800">
        {children}
      </pre>
    );
  },
};

export default function Home() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<Phase>("b-pre");
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<SessionMeta[]>([]);
  const [viewingArchive, setViewingArchive] = useState<ArchivedSession | null>(
    null,
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [printingIndex, setPrintingIndex] = useState<number | null>(null);
  const [loadingPhase, setLoadingPhase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domainKnowledge, setDomainKnowledge] =
    useState<DomainKnowledge | null>(null);
  const [researchOpen, setResearchOpen] = useState(false);
  const [bPreOutput, setBPreOutput] = useState<string | null>(null);
  const [bPrePanelOpen, setBPrePanelOpen] = useState(true);
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
    // Initial async load; sync setState inside .then is fine but the rule
    // flags the chain. Pattern is standard for client-side bootstrap.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshProjects()
      .then((list) => {
        if (list.length > 0) setCurrentSlug(list[0].slug);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [refreshProjects]);

  const refreshHistory = useCallback(
    async (slug: string, phase: Phase): Promise<SessionMeta[]> => {
      const res = await fetch(`/api/projects/${slug}/${phase}/history`);
      if (!res.ok) throw new Error("履歴一覧の取得に失敗");
      const data = (await res.json()) as { sessions: SessionMeta[] };
      setHistory(data.sessions);
      return data.sessions;
    },
    [],
  );

  const refreshDomainKnowledge = useCallback(async (slug: string) => {
    try {
      const res = await fetch(`/api/projects/${slug}/domain-knowledge`);
      if (!res.ok) {
        setDomainKnowledge(null);
        return;
      }
      const data = (await res.json()) as {
        domainKnowledge: DomainKnowledge | null;
      };
      setDomainKnowledge(data.domainKnowledge);
    } catch {
      setDomainKnowledge(null);
    }
  }, []);

  // Refresh DK whenever the active project changes.
  useEffect(() => {
    if (!currentSlug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDomainKnowledge(null);
      return;
    }
    refreshDomainKnowledge(currentSlug);
  }, [currentSlug, refreshDomainKnowledge]);

  useEffect(() => {
    if (currentPhase !== "c" || !currentSlug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBPreOutput(null);
      return;
    }
    fetch(`/api/projects/${currentSlug}/b-pre`)
      .then(async (r) => {
        if (!r.ok) return;
        const data = (await r.json()) as {
          conversation: { messages: Message[] };
        };
        const last = data.conversation.messages
          .filter((m) => m.role === "assistant")
          .at(-1);
        setBPreOutput(last?.content ?? null);
      })
      .catch(() => setBPreOutput(null));
  }, [currentPhase, currentSlug]);

  // When (slug, phase) changes, load that phase's current conversation and
  // its session history, and exit any open archive view. The three sync
  // setStates below are intentional UI resets; refactor candidate noted in
  // the Wave 3 PR for a key-based remount approach.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setViewingArchive(null);
    if (!currentSlug) {
      setMessages([]);
      setHistory([]);
      return;
    }
    let cancelled = false;
    setLoadingPhase(true);
    Promise.all([
      fetch(`/api/projects/${currentSlug}/${currentPhase}`).then(async (r) => {
        if (!r.ok) throw new Error(`load failed: ${r.status}`);
        return (await r.json()) as { conversation: { messages: Message[] } };
      }),
      refreshHistory(currentSlug, currentPhase),
    ])
      .then(([convRes]) => {
        if (!cancelled) setMessages(convRes.conversation.messages);
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
  }, [currentSlug, currentPhase, refreshHistory]);

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

  async function send(opts?: { editIndex?: number; editContent?: string }) {
    const trimmed = opts?.editContent ?? input.trim();
    if (!trimmed || streaming || !currentSlug || viewingArchive) return;
    setError(null);

    const baseMessages =
      opts?.editIndex !== undefined ? messages.slice(0, opts.editIndex) : messages;

    const userMsg: Message = { role: "user", content: trimmed };
    const next = [...baseMessages, userMsg];
    setMessages([...next, { role: "assistant", content: "" }]);
    if (opts?.editContent === undefined) setInput("");
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
      const acc = { content: "", reasoning: "" };

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
              acc.content += delta.content;
              changed = true;
            }
            if (
              typeof delta.reasoning_content === "string" &&
              delta.reasoning_content.length > 0
            ) {
              acc.reasoning += delta.reasoning_content;
              changed = true;
            }
            if (changed) {
              const snapshotContent = acc.content;
              const snapshotReasoning = acc.reasoning;
              setMessages((msgs) => {
                const copy = [...msgs];
                copy[copy.length - 1] = {
                  role: "assistant",
                  content: snapshotContent,
                  reasoning: snapshotReasoning || undefined,
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
          content: acc.content,
          ...(acc.reasoning ? { reasoning: acc.reasoning } : {}),
        },
      ];

      // Auto-save the completed conversation so the user can't lose it.
      await persistMessages(currentSlug, currentPhase, finalMessages);
      await refreshProjects();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // Remove both the user message and the empty assistant placeholder, and
      // restore the input so the user can press 送信 again to retry, or edit.
      setMessages((msgs) => msgs.slice(0, -2));
      setInput(trimmed);
    } finally {
      setStreaming(false);
    }
  }

  async function handleEditMessage(index: number, newContent: string) {
    if (!currentSlug || streaming || viewingArchive) return;
    const updated = messages.map((m, i) =>
      i === index ? { ...m, content: newContent } : m,
    );
    setMessages(updated);
    await persistMessages(currentSlug, currentPhase, updated);
    await refreshProjects();
  }

  function handleEditAndResend(index: number, newContent: string) {
    if (!currentSlug || streaming || viewingArchive) return;
    send({ editIndex: index, editContent: newContent });
  }

  async function handleNewSession() {
    if (!currentSlug || streaming || viewingArchive) return;
    if (messages.length === 0) return;
    if (
      !window.confirm(
        "現在のセッションをアーカイブして新規セッションを開始します。よろしいですか？",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/projects/${currentSlug}/${currentPhase}/history`,
        { method: "POST" },
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `archive failed: ${res.status}`);
      }
      setMessages([]);
      setError(null);
      await Promise.all([
        refreshHistory(currentSlug, currentPhase),
        refreshProjects(),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleViewArchive(sessionId: string) {
    if (!currentSlug || streaming) return;
    try {
      const res = await fetch(
        `/api/projects/${currentSlug}/${currentPhase}/history/${sessionId}`,
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `load failed: ${res.status}`);
      }
      const data = (await res.json()) as { session: ArchivedSession };
      setViewingArchive(data.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleBackToCurrent() {
    setViewingArchive(null);
  }

  async function handleDeleteArchive(sessionId: string) {
    if (!currentSlug || streaming) return;
    if (!window.confirm("この履歴セッションを削除しますか？")) return;
    try {
      await fetch(
        `/api/projects/${currentSlug}/${currentPhase}/history/${sessionId}`,
        { method: "DELETE" },
      );
      if (viewingArchive?.id === sessionId) setViewingArchive(null);
      await refreshHistory(currentSlug, currentPhase);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function downloadMarkdown() {
    if (!currentSlug) return;
    const source = viewingArchive ? viewingArchive.messages : messages;
    const lastAssistant = [...source]
      .reverse()
      .find((m) => m.role === "assistant" && m.content.trim().length > 0);
    if (!lastAssistant) return;
    const projectName =
      projects.find((p) => p.slug === currentSlug)?.name ?? currentSlug;
    const phaseLabel = PHASE_LABELS[currentPhase];
    const today = new Date().toISOString().slice(0, 10);
    const suffix = viewingArchive ? `__archive-${viewingArchive.id}` : "";
    const filename = `${projectName}__${phaseLabel}__${today}${suffix}.md`;

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

  function printToPDF(index: number) {
    const cleanup = () => {
      setPrintingIndex(null);
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    flushSync(() => setPrintingIndex(index));
    window.print();
  }


  const hasProject = currentSlug !== null;
  const isReadOnly = viewingArchive !== null;
  const displayedMessages = viewingArchive ? viewingArchive.messages : messages;
  const canExport = displayedMessages.some(
    (m) => m.role === "assistant" && m.content.trim().length > 0,
  );
  const showRefPanel = currentPhase === "c" && bPreOutput !== null && bPrePanelOpen;

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setResearchOpen(true)}
                  disabled={streaming}
                  title={
                    domainKnowledge
                      ? `「${domainKnowledge.query}」を ${formatLocalTime(
                          domainKnowledge.generatedAt,
                        )} にリサーチ済み（GRILL に注入されます）`
                      : "ヒアリング前に法令・実務情報を集めて GRILL に注入する"
                  }
                  className={`rounded-md border px-2 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                    domainKnowledge
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  <BookOpen className="inline-block h-3.5 w-3.5 mr-1 align-[-0.1em]" />
                  {domainKnowledge ? "リサーチ済み" : "法令・実務リサーチ"}
                </button>
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
              </div>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <select
                    value={viewingArchive?.id ?? ""}
                    onChange={(e) => {
                      if (e.target.value) handleViewArchive(e.target.value);
                      else handleBackToCurrent();
                    }}
                    disabled={streaming}
                    title="このフェーズのアーカイブ済みセッション"
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    <option value="">現在のセッション</option>
                    {history.map((s) => (
                      <option key={s.id} value={s.id}>
                        履歴 {formatLocalTime(s.updatedAt)}（{s.messageCount}件）
                      </option>
                    ))}
                  </select>
                )}
                {currentPhase === "c" && bPreOutput !== null && (
                  <button
                    onClick={() => setBPrePanelOpen((v) => !v)}
                    disabled={streaming}
                    className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {bPrePanelOpen ? "準備資料を隠す" : "準備資料を表示"}
                  </button>
                )}
                <button
                  onClick={handleNewSession}
                  disabled={
                    streaming || isReadOnly || messages.length === 0
                  }
                  title="現在のセッションをアーカイブし、新規セッションを開始"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <PlusCircle className="inline-block h-3.5 w-3.5 mr-1 align-[-0.1em]" />
                  ヒアリングを再開
                </button>
                <button
                  onClick={downloadMarkdown}
                  disabled={streaming || !canExport}
                  title="このフェーズの最新の応答を Markdown としてダウンロード"
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  <Download className="inline-block h-3.5 w-3.5 mr-1 align-[-0.1em]" />
                  Markdown
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className={`ops-main-container flex w-full flex-1 overflow-hidden ${showRefPanel ? "flex-row" : "flex-col px-6"}`}>
        <div className={`flex flex-col overflow-hidden ${showRefPanel ? "flex-1 px-6" : "flex-1"}`}>
        <div className="ops-scroll-container flex flex-1 flex-col overflow-y-auto py-6">
        {isReadOnly && viewingArchive && (
          <div className="mb-4 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
            <span>
              アーカイブ閲覧中（編集・送信不可）:{" "}
              <strong>{formatLocalTime(viewingArchive.updatedAt)}</strong>（
              {viewingArchive.messages.length} 件）
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleDeleteArchive(viewingArchive.id)}
                disabled={streaming}
                className="rounded-md border border-amber-400 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-40 dark:border-amber-700 dark:text-amber-100 dark:hover:bg-amber-900"
              >
                この履歴を削除
              </button>
              <button
                onClick={handleBackToCurrent}
                className="rounded-md bg-amber-700 px-2 py-1 text-xs font-medium text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
              >
                現在のセッションに戻る
              </button>
            </div>
          </div>
        )}
        {!hasProject ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-zinc-500 dark:text-zinc-400">
            <p className="text-sm">
              まずプロジェクト（業務）を作成してください。
            </p>
            <p className="mt-2 text-xs">
              右上の「+ 新規」から業務名を入力すると、ヒアリング前準備 /
              ヒアリング中の伴走 / ヒアリング後の整理 の各フェーズが永続化されます。
            </p>
          </div>
        ) : loadingPhase ? (
          <div className="flex flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
            読み込み中…
          </div>
        ) : displayedMessages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-zinc-500 dark:text-zinc-400">
            <p className="text-sm">
              {PHASE_LABELS[currentPhase]} を始めましょう。
            </p>
            <p className="mt-2 text-xs">{PHASE_HINTS[currentPhase]}</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4">
            {(() => {
              const lastAssistantIdx = displayedMessages.reduce<number | null>(
                (found, m, i) =>
                  m.role === "assistant" && m.content.trim().length > 0
                    ? i
                    : found,
                null,
              );
              return displayedMessages.map((m, i) => {
                const isStreaming =
                  !isReadOnly &&
                  streaming &&
                  i === displayedMessages.length - 1;
                return (
                  <MessageBubble
                    key={i}
                    message={m}
                    streaming={isStreaming}
                    onEdit={
                      !isReadOnly && m.role === "assistant" && !isStreaming
                        ? (content) => handleEditMessage(i, content)
                        : undefined
                    }
                    onEditAndResend={
                      !isReadOnly && m.role === "user" && !streaming
                        ? (content) => handleEditAndResend(i, content)
                        : undefined
                    }
                    onPrint={
                      !isReadOnly && !streaming && i === lastAssistantIdx
                        ? () => printToPDF(i)
                        : undefined
                    }
                    isPrintTarget={i === printingIndex}
                  />
                );
              });
            })()}
            <div ref={bottomRef} />
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <strong>エラー:</strong> {error}
          </div>
        )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mx-auto flex w-full max-w-3xl gap-2 border-t border-zinc-200 pt-4 pb-6 dark:border-zinc-800"
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
              !hasProject
                ? "先にプロジェクトを作成してください"
                : isReadOnly
                  ? "アーカイブ閲覧中は送信できません"
                  : "メッセージを入力 (Cmd/Ctrl + Enter で送信)"
            }
            rows={3}
            disabled={streaming || !hasProject || isReadOnly}
            className="flex-1 resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim() || !hasProject || isReadOnly}
            className="self-end rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {streaming ? "送信中…" : "送信"}
          </button>
        </form>
        </div>
        {showRefPanel && (
          <aside className="ops-ref-panel w-80 shrink-0 border-l border-zinc-200 bg-white flex flex-col overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                ヒアリング準備資料
              </span>
              <button
                onClick={() => setBPrePanelOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm leading-none"
                aria-label="パネルを閉じる"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 text-xs">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={refPanelComponents}>
                {bPreOutput}
              </ReactMarkdown>
            </div>
          </aside>
        )}
      </main>
      {researchOpen && currentSlug && (
        <DomainResearchModal
          projectSlug={currentSlug}
          defaultQuery={
            projects.find((p) => p.slug === currentSlug)?.name ?? ""
          }
          existing={domainKnowledge}
          onClose={() => setResearchOpen(false)}
          onSaved={() => {
            if (currentSlug) refreshDomainKnowledge(currentSlug);
          }}
        />
      )}
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
  onEdit,
  onEditAndResend,
  onPrint,
  isPrintTarget,
}: {
  message: Message;
  streaming: boolean;
  onEdit?: (newContent: string) => void;
  onEditAndResend?: (content: string) => void;
  onPrint?: () => void;
  isPrintTarget?: boolean;
}) {
  const isUser = message.role === "user";
  const hasReasoning = !isUser && message.reasoning && message.reasoning.length > 0;
  const hasContent = message.content.length > 0;
  const canEdit = isUser
    ? !!onEditAndResend && !streaming && hasContent
    : !!onEdit && !streaming && hasContent;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  // Keep draft in sync when the underlying message content changes from
  // outside (e.g., switching phases or receiving streamed updates). The
  // canonical "useEffect to sync prop into state" pattern triggers the
  // rule; refactor candidate is uncontrolled textarea + key remount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setDraft(message.content);
  }, [message.content, editing]);

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

  function saveEdit() {
    if (isUser) {
      onEditAndResend?.(draft);
    } else {
      onEdit?.(draft);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setDraft(message.content);
    setEditing(false);
  }

  return (
    <div className={`ops-message flex ${isUser ? "justify-end" : "justify-start"}${isPrintTarget ? " ops-print-target" : ""}`}>
      <div className="flex max-w-[85%] flex-col">
        <div
          className={`ops-bubble flex flex-col gap-2 rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isUser
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-800"
          } ${editing ? "min-w-[28rem]" : ""}`}
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
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(24, Math.max(4, draft.split("\n").length + 1))}
                autoFocus
                className={`w-full resize-y rounded-md border p-2 font-mono text-xs focus:outline-none ${
                  isUser
                    ? "border-zinc-600 bg-zinc-800 text-white focus:border-zinc-400"
                    : "border-zinc-300 bg-white text-zinc-900 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                }`}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelEdit}
                  className={`rounded-md border px-3 py-1 text-xs font-medium ${
                    isUser
                      ? "border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  キャンセル
                </button>
                <button
                  onClick={saveEdit}
                  className={`rounded-md px-3 py-1 text-xs font-medium ${
                    isUser
                      ? "bg-zinc-100 text-zinc-900 hover:bg-white"
                      : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  }`}
                >
                  {isUser ? "再送信" : "保存"}
                </button>
              </div>
            </div>
          ) : hasContent ? (
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
        {(canEdit || onPrint) && !editing && (
          <div className="ops-message-actions mt-1 inline-flex gap-3">
            {canEdit && (
              <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 self-start text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                <Pencil className="h-3 w-3" />
                編集
              </button>
            )}
            {onPrint && (
              <button
                onClick={onPrint}
                className="inline-flex items-center gap-1 self-start text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                <Printer className="h-3 w-3" />
                印刷・PDF
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
