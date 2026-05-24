// Tool calling ループの動作確認スクリプト。
// HTTP を経由せず app/lib/research-loop.ts の runResearch を直接呼ぶ。
//
// 使い方:
//   1. llama-server を http://localhost:8080 で起動 (LLAMA_BASE_URL で上書き可)
//   2. npm run test:research -- "成人病予防健診"
//      (引数省略時はデフォルトの「成人病予防健診」)
//
// 出力: 各 phase / tool 結果 / 最終ノートを逐次表示。
// 「成人病予防健診」で実行した場合の期待挙動:
//   - LLM が「生活習慣病予防健診」「労働安全衛生規則」「定期健康診断」へ
//     クエリリライト → egov_search で 0 件回避 → 条文取得 → 健保ページ取得 → ノート

import { runResearch, type ResearchEvent } from "../app/lib/research-loop";

async function main() {
  const query = process.argv[2] ?? "成人病予防健診";
  console.log(`\n=== query: ${query} ===\n`);

  const result = await runResearch(query, (e: ResearchEvent) => {
    switch (e.kind) {
      case "phase":
        console.log(`\n--- iter ${e.iter}: phase=${e.phase} ---`);
        break;
      case "llm_raw":
        console.log(`[LLM 出力 ${e.content.length}字]`);
        console.log(e.content.slice(0, 400));
        if (e.content.length > 400) console.log("...");
        break;
      case "tool_call":
        console.log(`[tool_call] ${JSON.stringify(e.call)}`);
        break;
      case "egov_search_result":
        console.log(
          `[egov_search] "${e.title}" → ${e.candidates.length} 件`,
        );
        for (const c of e.candidates.slice(0, 3)) {
          console.log(`  - ${c.lawTitle} (${c.lawNum}) [${c.lawId}]`);
        }
        break;
      case "egov_article_result":
        console.log(
          `[egov_article] ${e.law_title} 第${e.article_num}条 found=${e.found} chars=${e.chars}`,
        );
        break;
      case "fetch_page_result":
        console.log(
          `[fetch_page] ${e.url} status=${e.status} chars=${e.chars}`,
        );
        break;
      case "final":
        console.log("\n=== 最終ノート ===\n");
        console.log(e.answer);
        break;
      case "error":
        console.error(`[error] ${e.message}`);
        break;
    }
  });

  console.log(
    `\n=== done (iterations=${result.iterations}, answered=${!!result.answer}) ===`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
