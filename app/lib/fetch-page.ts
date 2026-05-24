// 任意の HTML ページを取得してプレーンテキストに変換する。
// toolcalling-demo の fetch_page と同等の役割で、
// 公的機関サイト等の非構造化ソース(API がない情報源)を読むのに使う。
//
// 設計方針:
//   - DOM パーサは使わない。サーバ実行で重い依存を増やしたくない。
//   - script/style/nav/header/footer を除去 → タグ削り → 空白整形、で十分。
//   - 上限文字数を超えたら切る (LLM への注入で context を食い潰さないため)。

export type FetchedPage = {
  url: string;
  ok: boolean;
  status: number;
  text: string;
  chars: number;
};

const DEFAULT_MAX_CHARS = 4000;

export async function fetchPage(
  url: string,
  maxChars = DEFAULT_MAX_CHARS,
): Promise<FetchedPage> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "grillme-demo/0.1 (+domain-knowledge collector; verifying)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  const html = await res.text();
  const text = htmlToText(html).slice(0, maxChars);

  return {
    url,
    ok: res.ok,
    status: res.status,
    text,
    chars: text.length,
  };
}

export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  s = s.replace(/<header[\s\S]*?<\/header>/gi, "");
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  s = s.replace(/<[^>]+>/g, "\n");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return s
    .split("\n")
    .map((ln) => ln.trim())
    .filter((ln) => ln.length > 0)
    .join("\n");
}

// 取得テキストから、特定キーワード周辺の文脈だけを切り出す。
// ハブページのナビ部分まで全部 LLM に渡すと無駄が多いので、
// 「生活習慣病予防健診」のような中核語の近傍だけ抽出する。
export function sliceAroundKeyword(
  text: string,
  keyword: string,
  before = 100,
  after = 1800,
): string | null {
  const idx = text.indexOf(keyword);
  if (idx < 0) return null;
  return text.slice(Math.max(0, idx - before), idx + after);
}
