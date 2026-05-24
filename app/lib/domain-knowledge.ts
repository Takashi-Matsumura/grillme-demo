import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isValidSlug, projectDir } from "@/app/lib/projects";

// プロジェクトごとに 1 ファイルだけ保持する「外部から収集したドメイン知識」。
// /api/research の出力を保存し、/api/chat の system prompt に注入することで、
// ローカル LLM 単独では辿り着けない法令・実務情報を GRILL に持ち込む。
//
// 構造化された JSON にしておくのは、後で「いつ、どのクエリで集めたか」を
// プロジェクト UI から表示できるようにするため。本文だけが必要な場面では
// content フィールドを取り出して使う。

export type DomainKnowledge = {
  query: string;
  content: string;
  iterations: number;
  generatedAt: string;
};

export function domainKnowledgePath(slug: string): string {
  return path.join(projectDir(slug), "domain_knowledge.json");
}

export async function saveDomainKnowledge(
  slug: string,
  dk: DomainKnowledge,
): Promise<void> {
  if (!isValidSlug(slug)) throw new Error("invalid slug");
  await writeFile(
    domainKnowledgePath(slug),
    `${JSON.stringify(dk, null, 2)}\n`,
    "utf-8",
  );
}

export async function readDomainKnowledge(
  slug: string,
): Promise<DomainKnowledge | null> {
  if (!isValidSlug(slug)) return null;
  try {
    const raw = await readFile(domainKnowledgePath(slug), "utf-8");
    return JSON.parse(raw) as DomainKnowledge;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function deleteDomainKnowledge(slug: string): Promise<void> {
  if (!isValidSlug(slug)) return;
  await rm(domainKnowledgePath(slug), { force: true });
}

// system prompt に貼り付ける形に整形する。
// プロジェクトのドメイン知識として「世界が知っていること」を提示する役割。
// 過去フェーズ出力（このプロジェクトでこれまでに話されたこと）とは別物。
export function formatDomainKnowledgeForPrompt(dk: DomainKnowledge): string {
  return (
    `## 外部から収集したドメイン知識（クエリ: ${dk.query}）\n\n` +
    `${dk.content}\n\n` +
    `（${dk.generatedAt} に外部一次情報から自動収集）`
  );
}
