// 信頼 URL レジストリの health check。
// 外部サイトはサイレントに URL を変える(rot)。半年〜1年経つと
// 「200 で登録したはずの URL が 404」が現実的に起きる。
//
// このスクリプトを定期的に走らせて、登録した URL が今もすべて 200 で
// 返ることを確認する。URL を新規追加する時のチェックにも使える。
//
//   npm run check:urls
//
// 終了コード:
//   0 = 全 URL が 2xx
//   1 = 1 件以上が 2xx 以外、またはネットワーク失敗

import { TRUSTED_URLS } from "../app/lib/trusted-urls";

async function probe(url: string): Promise<{ ok: boolean; detail: string }> {
  try {
    // 一部の厚労省ページは HEAD を 405 で返すので GET で確認。
    // body は捨てて転送量を抑える。
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    res.body?.cancel();
    if (res.ok) return { ok: true, detail: `HTTP ${res.status}` };
    return { ok: false, detail: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  console.log(`Probing ${TRUSTED_URLS.length} trusted URLs...\n`);
  let failures = 0;
  for (const entry of TRUSTED_URLS) {
    const result = await probe(entry.url);
    const mark = result.ok ? "✓" : "✗";
    console.log(`${mark} [${result.detail.padEnd(8)}] ${entry.url}`);
    if (!result.ok) {
      console.log(`    └ ${entry.description}`);
      failures++;
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} / ${TRUSTED_URLS.length} URL(s) FAILED.`);
    console.error(
      "登録 URL がリンク切れしています。app/lib/trusted-urls.ts の該当エントリを実在 URL に差し替えるか削除してください。",
    );
    process.exit(1);
  }
  console.log(`\nAll ${TRUSTED_URLS.length} URLs OK.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
