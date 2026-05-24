// 「成人病予防健診」クエリで外部知識を辿れるか確認する検証スクリプト。
//
// 観察したいこと:
//   1. 生クエリ「成人病予防健診」だけでは法令にヒットしない
//      → LLM 側でクエリリライト(定期健康診断 / 労働安全衛生規則)が必要
//   2. 法令名で laws API → law_data API と二段で辿れば条文本文に届く
//   3. 取得した条文が、ローカル LLM 単独より明らかに精度の高い
//      ドメイン知識として GRILL に注入できるサイズ・内容になっているか
//
// 使い方: npm run verify:egov

import {
  searchLawsByTitle,
  getArticleByLawTitle,
} from "../app/lib/egov";
import { fetchPage, sliceAroundKeyword } from "../app/lib/fetch-page";

async function main() {
  console.log("=== step 1: 生クエリでの法令検索（ヒットしないことを確認）===");
  const raw = await searchLawsByTitle("成人病予防健診");
  console.log(`hits: ${raw.length}`);

  console.log("\n=== step 2: リライト後のクエリで法令を特定 ===");
  const rewritten = await searchLawsByTitle("労働安全衛生規則");
  for (const x of rewritten) {
    console.log(`- ${x.lawTitle} (${x.lawNum}) [${x.lawId}]`);
  }

  console.log("\n=== step 3: 安衛則 第44条「定期健康診断」本文を取得 ===");
  const article = await getArticleByLawTitle("労働安全衛生規則", 44);
  if (!article) {
    console.log("not found");
  } else {
    console.log(`law_id: ${article.lawId}`);
    console.log(`title : ${article.lawTitle} 第${article.articleNum}条`);
    console.log(`chars : ${article.text.length}`);
    console.log("--- text ---");
    console.log(article.text);
  }

  console.log("\n=== step 4: 協会けんぽ 生活習慣病予防健診ページを取得 ===");
  const page = await fetchPage(
    "https://www.kyoukaikenpo.or.jp/g4/cat410/",
    8000,
  );
  console.log(`url   : ${page.url}`);
  console.log(`status: ${page.status}  chars: ${page.chars}`);
  const sliced = sliceAroundKeyword(page.text, "生活習慣病予防健診");
  console.log("--- 抜粋（生活習慣病予防健診 周辺）---");
  console.log(sliced ?? "(キーワード未検出)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
