// 外部知識ソースの「検証済み URL」と「信頼ホスト」を一元管理する。
//
// 設計意図:
//   ローカル LLM (gemma) は fetch_page に渡す URL を平気で捏造する
//   (例: www.kyokai.sk.jp/kenko/index.html や mhlw.go.jp/shiryo/index.html)。
//   システムプロンプトに「ここから選べ」と検証済み URL を明示し、
//   fetch_page 側でも信頼ホスト以外を弾く二段ガードで防ぐ。
//
//   ここに登録する URL は **追加前に curl で HTTP 200 確認** すること。
//   私(LLM/開発者) もハルシネーションするので、URL を本ファイルに足す時は
//   必ず実在を確かめる。

export type TrustedUrl = {
  url: string;
  description: string;
  // クエリにいずれかが含まれていればこの URL を推奨する。
  // 空配列ならテーマ非依存の「共通 URL」として常に推奨。
  themeKeywords: string[];
};

export const TRUSTED_URLS: TrustedUrl[] = [
  {
    url: "https://laws.e-gov.go.jp/",
    description:
      "e-Gov 法令検索トップ (条文は egov_search/egov_article で取れるので fetch_page は基本不要)",
    themeKeywords: [],
  },
  {
    url: "https://www.mhlw.go.jp/",
    description: "厚生労働省トップ (テーマ別の運用情報はここから辿る)",
    themeKeywords: [],
  },
  {
    url: "https://www.kyoukaikenpo.or.jp/g4/cat410/",
    description:
      "協会けんぽ 健診ハブ (生活習慣病予防健診の検査項目・対象年齢・自己負担額)",
    themeKeywords: [
      "健診",
      "健康診断",
      "成人病",
      "生活習慣病",
      "人間ドック",
    ],
  },
  {
    url: "https://www.mhlw.go.jp/bunya/roudoukijun/anzeneisei12/index.html",
    description: "厚労省 労働安全衛生 (ストレスチェック制度等)",
    themeKeywords: ["ストレスチェック", "メンタルヘルス", "安全衛生"],
  },
  {
    url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyoukintou/seisaku06/index.html",
    description: "厚労省 雇用環境・均等 (ハラスメント対策等)",
    themeKeywords: ["ハラスメント", "パワハラ", "セクハラ", "マタハラ"],
  },
];

// fetch_page で許可するホスト。これ以外は実行前に拒否する。
export const TRUSTED_HOSTS: ReadonlySet<string> = new Set([
  "laws.e-gov.go.jp",
  "www.mhlw.go.jp",
  "www.kyoukaikenpo.or.jp",
]);

export function isHostTrusted(url: string): boolean {
  try {
    return TRUSTED_HOSTS.has(new URL(url).host);
  } catch {
    return false;
  }
}

export function selectRelevantUrls(query: string): TrustedUrl[] {
  return TRUSTED_URLS.filter(
    (u) =>
      u.themeKeywords.length === 0 ||
      u.themeKeywords.some((kw) => query.includes(kw)),
  );
}

export function formatTrustedUrlsForPrompt(urls: TrustedUrl[]): string {
  return urls.map((u) => `  - ${u.description}: ${u.url}`).join("\n");
}
