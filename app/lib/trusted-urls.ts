// 外部知識ソースの「検証済み URL」と「信頼ホスト」を一元管理する。
//
// 設計意図:
//   ローカル LLM (gemma) は fetch_page に渡す URL を平気で捏造する
//   (例: www.kyokai.sk.jp/kenko/index.html や mhlw.go.jp/shiryo/index.html)。
//   システムプロンプトに「ここから選べ」と検証済み URL を明示し、
//   fetch_page 側でも信頼ホスト以外を弾く二段ガードで防ぐ。
//
// 追加・運用フロー:
//   1. 候補 URL を curl で HTTP 200 確認:
//      curl -sL -o /dev/null -w "%{http_code}\n" <URL>
//   2. 本ファイルの TRUSTED_URLS に追記。ホストが TRUSTED_HOSTS 外なら
//      ホストも追加 (信頼できる公的機関のみ)。
//   3. テーマキーワードはユーザーが書く自然な日本語で複数。
//      クエリ文字列に includes() 一致するだけなので過剰に増やさない
//      (誤検出で関係ない URL を提示しても LLM が混乱する)。
//   4. `npm run check:urls` で全 URL の生存確認。CI に組み込まないのは
//      外部依存で flake しやすいため、手動運用とする。
//   5. レジストリに対応 URL が無いテーマでは、LLM は fetch_page を
//      無理に使わず egov_search/egov_article 側で情報を厚くする
//      (システムプロンプトでそう指示している)。

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
  {
    url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/jikan/index.html",
    description: "厚労省 労働時間制度 (36協定・時間外労働・上限規制)",
    themeKeywords: ["36協定", "時間外労働", "残業", "労働時間", "上限規制"],
  },
  {
    url: "https://www.mhlw.go.jp/bunya/roudoukijun/anzeneisei06/index.html",
    description: "厚労省 産業保健 (産業医・健康管理体制)",
    themeKeywords: ["産業医", "産業保健", "健康管理"],
  },
  {
    url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/rousai/index.html",
    description: "厚労省 労災保険",
    themeKeywords: ["労災", "労災保険", "業務災害", "通勤災害"],
  },
  {
    url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/koyou/index.html",
    description: "厚労省 雇用 (雇用保険・職業安定)",
    themeKeywords: ["雇用保険", "失業給付", "求職", "ハローワーク"],
  },
  {
    url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000192188.html",
    description: "厚労省 副業・兼業の促進に関するガイドライン",
    themeKeywords: ["副業", "兼業"],
  },
  {
    url: "https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/koyou_roudou/roudoukijun/index.html",
    description:
      "厚労省 労働基準ハブ (就業規則・労働条件・賃金・解雇など個別ページが無いテーマの入口)",
    themeKeywords: [
      "就業規則",
      "労働条件",
      "労働基準",
      "賃金",
      "解雇",
      "退職",
      "有給",
      "年次有給休暇",
    ],
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
