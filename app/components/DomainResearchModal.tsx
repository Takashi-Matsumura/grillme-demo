"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ArchivedDomainKnowledge,
  DomainKnowledge,
  DomainKnowledgeArchiveMeta,
} from "@/app/lib/domain-knowledge";
import type { ResearchEvent } from "@/app/lib/research-loop";

// /api/research が SSE で配信する ResearchEvent 系に加え、
// route 側で controller.enqueue している保存系イベントもこのモーダルで扱う。
type StreamEvent =
  | ResearchEvent
  | { kind: "saved"; projectSlug: string }
  | { kind: "save_error"; message: string }
  | { kind: "done" };

type Props = {
  projectSlug: string;
  defaultQuery: string;
  existing: DomainKnowledge | null;
  onClose: () => void;
  onSaved: () => void;
};

export function DomainResearchModal({
  projectSlug,
  defaultQuery,
  existing,
  onClose,
  onSaved,
}: Props) {
  const [query, setQuery] = useState(defaultQuery);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<ResearchEvent[]>([]);
  const [answer, setAnswer] = useState<string | null>(existing?.content ?? null);
  const [saved, setSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [archives, setArchives] = useState<DomainKnowledgeArchiveMeta[]>([]);
  const [expanded, setExpanded] = useState<ArchivedDomainKnowledge | null>(
    null,
  );

  const refreshArchives = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/domain-knowledge/history`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        archives: DomainKnowledgeArchiveMeta[];
      };
      setArchives(data.archives);
    } catch {
      // history is non-critical; ignore fetch failures
    }
  }, [projectSlug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshArchives();
  }, [refreshArchives]);

  async function expandArchive(id: string) {
    if (expanded?.id === id) {
      setExpanded(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/domain-knowledge/history/${id}`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { archive: ArchivedDomainKnowledge };
      setExpanded(data.archive);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function restoreArchive(id: string) {
    if (!window.confirm("この版を現行に戻します。よろしいですか？")) return;
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/domain-knowledge/history/${id}/restore`,
        { method: "POST" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error ?? `restore failed: ${res.status}`);
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeArchive(id: string) {
    if (!window.confirm("この履歴を削除しますか？（元に戻せません）")) return;
    try {
      const res = await fetch(
        `/api/projects/${projectSlug}/domain-knowledge/history/${id}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorMsg(err.error ?? `delete failed: ${res.status}`);
        return;
      }
      if (expanded?.id === id) setExpanded(null);
      await refreshArchives();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function run() {
    if (!query.trim() || running) return;
    setRunning(true);
    setEvents([]);
    setAnswer(null);
    setSaved(false);
    setErrorMsg(null);

    let res: Response;
    try {
      res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), projectSlug }),
      });
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setRunning(false);
      return;
    }

    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.error ?? `request failed: ${res.status}`);
      setRunning(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;
        try {
          const ev = JSON.parse(data) as StreamEvent;
          if (ev.kind === "final") {
            setAnswer(ev.answer);
          } else if (ev.kind === "saved") {
            setSaved(true);
            onSaved();
            refreshArchives();
          } else if (ev.kind === "save_error") {
            setErrorMsg(`保存に失敗: ${ev.message}`);
          } else if (ev.kind === "error") {
            setErrorMsg(ev.message);
          } else if (ev.kind === "done") {
            // stream finished; nothing to do
          } else {
            setEvents((evs) => [...evs, ev as ResearchEvent]);
          }
        } catch {
          // ignore malformed SSE line
        }
      }
    }

    setRunning(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8"
      onClick={(e) => {
        if (e.target === e.currentTarget && !running) onClose();
      }}
    >
      <div className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              📚 ドメイン下調べ
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              e-Gov 法令検索・厚労省・協会けんぽ から一次情報を tool calling
              で集めて、GRILL の system prompt に注入します。
            </p>
            {existing && !answer && (
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                既存: クエリ「{existing.query}」 ・{" "}
                {new Date(existing.generatedAt).toLocaleString()} に保存
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            クエリ
          </label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={running}
            placeholder="例: 成人病予防健診"
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={running}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {saved ? "閉じる" : "キャンセル"}
          </button>
          <button
            onClick={run}
            disabled={running || !query.trim()}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {running
              ? "実行中..."
              : answer
                ? "再実行"
                : existing
                  ? "上書き実行"
                  : "実行"}
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {errorMsg}
          </div>
        )}

        {events.length > 0 && (
          <details className="mt-4" open={running && !answer}>
            <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-400">
              ステップログ ({events.length} 件)
            </summary>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md bg-zinc-50 p-3 text-xs font-mono text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              {events.map((e, i) => (
                <div key={i}>{formatEvent(e)}</div>
              ))}
            </div>
          </details>
        )}

        {answer && (
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                {saved ? "最終ノート" : "現在のドメイン知識"}
              </span>
              {saved && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  ✅ 保存しました — GRILL の system prompt に注入されます
                </span>
              )}
            </div>
            <div className="mt-2 max-h-96 overflow-y-auto rounded-md border border-zinc-200 bg-white p-4 text-sm leading-relaxed text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100">
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {answer}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {archives.length > 0 && (
          <details className="mt-4" open={!running && !answer}>
            <summary className="cursor-pointer text-xs font-medium text-zinc-600 dark:text-zinc-400">
              履歴 ({archives.length} 件)
            </summary>
            <div className="mt-2 space-y-2">
              {archives.map((a) => {
                const isExpanded = expanded?.id === a.id;
                return (
                  <div
                    key={a.id}
                    className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-zinc-700 dark:text-zinc-300">
                        <div className="font-medium">「{a.query}」</div>
                        <div className="mt-0.5 text-zinc-500 dark:text-zinc-400">
                          {new Date(a.generatedAt).toLocaleString()} 生成 ・{" "}
                          {a.iterations} 反復 ・{" "}
                          {new Date(a.archivedAt).toLocaleString()} 退避
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => expandArchive(a.id)}
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          {isExpanded ? "閉じる" : "内容"}
                        </button>
                        <button
                          onClick={() => restoreArchive(a.id)}
                          disabled={running}
                          className="rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-40 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900"
                        >
                          🔄 この版に戻す
                        </button>
                        <button
                          onClick={() => removeArchive(a.id)}
                          disabled={running}
                          className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    {isExpanded && expanded && (
                      <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-zinc-200 bg-white p-3 text-xs leading-relaxed dark:border-zinc-700 dark:bg-zinc-900">
                        <div className="prose prose-xs max-w-none dark:prose-invert">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {expanded.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

function formatEvent(e: ResearchEvent): string {
  switch (e.kind) {
    case "phase":
      return `iter ${e.iter}: phase=${e.phase}`;
    case "tool_call":
      return `→ ${JSON.stringify(e.call)}`;
    case "egov_search_result":
      return `  egov_search("${e.title}") → ${e.candidates.length} 件`;
    case "egov_article_result":
      return `  egov_article(${e.law_title}, ${e.article_num}) found=${e.found} chars=${e.chars}`;
    case "fetch_page_result":
      return `  fetch_page(${e.url}) status=${e.status} chars=${e.chars}`;
    case "llm_raw":
      return `  LLM (${e.content.length}字)`;
    case "final":
      return `  最終ノート (${e.answer.length}字)`;
    case "error":
      return `  ⚠ ${e.message}`;
  }
}
