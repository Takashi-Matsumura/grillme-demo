// e-Gov 法令検索 API v2 の薄いクライアント。
// 法令の正式名称から law_id を引き、本文ツリーから特定の条を抜き出す。
//
// なぜ単純な keyword 検索ではなく laws + law_data の二段構えか:
//   keyword 検索はスコアリングが不安定で、欲しい法令が上位に来ない場合がある。
//   業務分掌の参照基準として確実に正しい条文を取りたいので、
//   「正式名称で法令を特定 → 法令本文の中から条番号で抜き出す」方式にしている。

const EGOV_BASE = "https://laws.e-gov.go.jp/api/2";

export type EgovLawSummary = {
  lawId: string;
  lawTitle: string;
  lawNum: string;
};

export type EgovArticle = {
  lawId: string;
  lawTitle: string;
  articleNum: string;
  text: string;
};

type LawsResponse = {
  total_count?: number;
  laws?: {
    law_info?: { law_id?: string; law_num?: string };
    revision_info?: { law_title?: string };
  }[];
};

// law_full_text は { tag, attr, children } のツリー構造。
type LawNode = {
  tag?: string;
  attr?: Record<string, string>;
  children?: (LawNode | string)[];
};

type LawDataResponse = {
  revision_info?: { law_title?: string };
  law_full_text?: LawNode;
};

export async function searchLawsByTitle(
  title: string,
  limit = 5,
): Promise<EgovLawSummary[]> {
  const url =
    `${EGOV_BASE}/laws?law_title=${encodeURIComponent(title)}` +
    `&limit=${limit}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`e-Gov laws API failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as LawsResponse;
  return (data.laws ?? [])
    .map((x) => ({
      lawId: x.law_info?.law_id ?? "",
      lawTitle: x.revision_info?.law_title ?? "",
      lawNum: x.law_info?.law_num ?? "",
    }))
    .filter((x) => x.lawId && x.lawTitle);
}

export async function fetchLawData(lawId: string): Promise<LawDataResponse> {
  const url = `${EGOV_BASE}/law_data/${encodeURIComponent(lawId)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`e-Gov law_data API failed: HTTP ${res.status}`);
  }
  return (await res.json()) as LawDataResponse;
}

export function findArticle(
  root: LawNode | undefined,
  num: number | string,
): LawNode | null {
  if (!root) return null;
  const target = String(num);
  const stack: (LawNode | string)[] = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node === "string") continue;
    if (node.tag === "Article" && node.attr?.Num === target) {
      return node;
    }
    if (node.children) stack.push(...node.children);
  }
  return null;
}

export function extractText(node: LawNode | string | undefined): string {
  if (node === undefined) return "";
  if (typeof node === "string") return node;
  const parts: string[] = [];
  for (const ch of node.children ?? []) parts.push(extractText(ch));
  return parts.join("");
}

// 法令名 + 条番号で本文を取得する高水準ヘルパ。
// 検証コードと、将来の Tool calling 経由呼び出しで共用する。
export async function getArticleByLawTitle(
  lawTitle: string,
  articleNum: number | string,
): Promise<EgovArticle | null> {
  const candidates = await searchLawsByTitle(lawTitle);
  const exact = candidates.find((x) => x.lawTitle === lawTitle) ?? candidates[0];
  if (!exact) return null;
  const data = await fetchLawData(exact.lawId);
  const art = findArticle(data.law_full_text, articleNum);
  if (!art) return null;
  return {
    lawId: exact.lawId,
    lawTitle: data.revision_info?.law_title ?? exact.lawTitle,
    articleNum: String(articleNum),
    text: extractText(art),
  };
}
