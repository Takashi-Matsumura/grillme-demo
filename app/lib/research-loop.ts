// 「ドメイン下調べ」用の Tool calling ループ本体。
//
// gemma など OpenAI の tools API に非対応なローカル LLM に対して、
// 「ツールを使う時は決まった JSON だけを出力せよ」とプロンプトで指示し、
// アプリ側で JSON を検出・実行・結果を会話に戻す方式。
// (toolcalling-demo と同じ方式)
//
// API route と検証スクリプトの両方から呼べるよう、関数として独立させ、
// 各ステップは onEvent コールバックで通知する。SSE 化は呼び出し側で行う。

import { chatCompletion, type LlmMessage } from "./llm";
import {
  type EgovLawSummary,
  getArticleByLawTitle,
  searchLawsByTitle,
} from "./egov";
import { type FetchedPage, fetchPage } from "./fetch-page";
import {
  TRUSTED_HOSTS,
  formatTrustedUrlsForPrompt,
  isHostTrusted,
  selectRelevantUrls,
} from "./trusted-urls";

// クエリに応じてシステムプロンプトを組み立てる。
// trusted-urls.ts のレジストリからテーマに該当する URL だけを注入し、
// gemma が他ドメインの URL を捏造する余地を減らす。
export function buildResearchSystemPrompt(query: string): string {
  const urls = selectRelevantUrls(query);
  const urlList = formatTrustedUrlsForPrompt(urls);
  const hostsList = [...TRUSTED_HOSTS].join(", ");
  return `あなたは日本の公的情報源から、ユーザーが指定したテーマに関する一次情報を集めるリサーチアシスタントです。最終目的は、そのテーマに関わる業務分掌（誰が何の責任を負うか）を整理するための「ドメイン知識ノート」を作ること。

利用できるツールは3つです:
  egov_search(title: string)
    e-Gov 法令検索で「法令名」を検索し、候補の law_id・正式名称・公布番号を返す。
  egov_article(law_title: string, article_num: number)
    法令名と条番号から、その条の本文（プレーンテキスト）を返す。
  fetch_page(url: string)
    任意 URL のページ本文を取得し、抽出テキストを返す。公的機関で API
    が無い情報源（協会けんぽ・厚労省 等）で使う。

【fetch_page の URL は捏造禁止】
fetch_page は次のホストに限定されており、それ以外は実行前に拒否される:
  ${hostsList}
推奨される検証済み URL は以下のとおり。これ以外の URL を組み立てる時も、
ホストは上記から選び、path も推測ではなく確認可能な範囲にとどめること:
${urlList}

リストに該当 URL がないテーマでは、無理に fetch_page を使わず、
egov_search / egov_article で法令側の情報を厚くする方を優先すること。

【重要: クエリリライト】
ユーザーが与えるテーマは、通称・旧称・俗称であることが多い。
例: 「成人病予防健診」→ 正しくは「生活習慣病予防健診」（健保用語）または
    「定期健康診断」（労働安全衛生規則 第44条）。
ツールに渡す前に、必ず**法令上の正式名称**と**実務での名称**を見立て、
それぞれで検索すること。生クエリ1回だけで終わらせない。

【調査の手順】
1. テーマを正式名称・実務名称にリライトし、関係しそうな法令名を egov_search
2. 該当法令を見つけたら、関連条文を egov_article で本文取得
3. 実務運用は fetch_page で 協会けんぽや厚労省のページを読む
4. 法令(義務) と 実務(運用) の両軸が揃ったらノートとして整理

【ツールの呼び出し方】
ツールを使うときは、返答として **次のいずれかの JSON だけ** を、
前後に一切の説明文を付けずに出力してください:
  {"tool":"egov_search","title":"労働安全衛生規則"}
  {"tool":"egov_article","law_title":"労働安全衛生規則","article_num":44}
  {"tool":"fetch_page","url":"https://..."}

【最終回答】
十分な情報が揃ったら JSON を出さず、次の見出し構成の Markdown で
ドメイン知識ノートを日本語で書いてください:

## 法令上の根拠
- <根拠条文の要約と短い引用、出典 URL>

## 実務上の運用基準
- <健保等の運用情報、対象者・補助額など、出典 URL>

## GRILL で確認すべき論点
- <相手企業に聞くべき具体的な質問を3〜5個>

重要: ツールを呼ぶターンでは JSON 以外を絶対に出力しないこと。`;
}

export type ResearchToolCall =
  | { tool: "egov_search"; title: string }
  | { tool: "egov_article"; law_title: string; article_num: number }
  | { tool: "fetch_page"; url: string };

export function parseToolCall(text: string): ResearchToolCall | null {
  const stripped = text
    .replace(/```(?:json)?/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = stripped.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === "{") depth++;
    else if (stripped[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          const obj = JSON.parse(stripped.slice(start, i + 1)) as Record<
            string,
            unknown
          >;
          if (
            obj.tool === "egov_search" &&
            typeof obj.title === "string" &&
            obj.title.trim()
          ) {
            return { tool: "egov_search", title: obj.title.trim() };
          }
          if (
            obj.tool === "egov_article" &&
            typeof obj.law_title === "string" &&
            obj.law_title.trim() &&
            (typeof obj.article_num === "number" ||
              typeof obj.article_num === "string")
          ) {
            const n = Number(obj.article_num);
            if (Number.isFinite(n)) {
              return {
                tool: "egov_article",
                law_title: obj.law_title.trim(),
                article_num: n,
              };
            }
          }
          if (
            obj.tool === "fetch_page" &&
            typeof obj.url === "string" &&
            /^https?:\/\//.test(obj.url.trim())
          ) {
            return { tool: "fetch_page", url: obj.url.trim() };
          }
        } catch {
          // 単なる Markdown など → ツール呼び出しではない
        }
        return null;
      }
    }
  }
  return null;
}

export type ResearchEvent =
  | { kind: "phase"; phase: "llm" | "tool_call" | "tool_exec" | "feedback" | "final"; iter: number }
  | { kind: "llm_raw"; content: string }
  | { kind: "tool_call"; call: ResearchToolCall }
  | {
      kind: "egov_search_result";
      title: string;
      candidates: EgovLawSummary[];
    }
  | {
      kind: "egov_article_result";
      law_title: string;
      article_num: number;
      found: boolean;
      chars: number;
    }
  | {
      kind: "fetch_page_result";
      url: string;
      ok: boolean;
      status: number;
      chars: number;
    }
  | { kind: "final"; answer: string }
  | { kind: "error"; message: string };

export type ResearchResult = {
  answer: string | null;
  iterations: number;
  events: ResearchEvent[];
};

// LLM 呼び出しの総回数。最後の 1 回はツールを禁止し、
// 収集済み情報だけで最終ノートを強制生成する「まとめ専用ステップ」に充てる。
// （= 実質ツール呼び出しは最大 MAX_STEPS - 1 回）
const MAX_STEPS = 9;

export async function runResearch(
  query: string,
  onEvent: (e: ResearchEvent) => void = () => {},
): Promise<ResearchResult> {
  const convo: LlmMessage[] = [
    { role: "system", content: buildResearchSystemPrompt(query) },
    { role: "user", content: query },
  ];
  const events: ResearchEvent[] = [];
  const emit = (e: ResearchEvent) => {
    events.push(e);
    onEvent(e);
  };

  for (let i = 0; i < MAX_STEPS; i++) {
    const iter = i + 1;

    // 最終ステップ: これ以上ツールは呼ばせず、収集済み情報だけで
    // 最終ノートを必ず書かせる。上限到達で成果を捨てないための救済。
    const forceSynthesis = iter >= MAX_STEPS;
    if (forceSynthesis) {
      emit({ kind: "phase", phase: "feedback", iter });
      convo.push({
        role: "user",
        content:
          "ステップ上限に達しました。これ以上ツールは呼べません。" +
          "ここまでに収集した情報だけを根拠に、JSON を一切出さず、" +
          "指定の Markdown 構成（## 法令上の根拠 / ## 実務上の運用基準 / " +
          "## GRILL で確認すべき論点）で最終ノートを必ず書いてください。" +
          "確認できなかった項目は「未確認」と明記して構いません。",
      });
    }

    emit({ kind: "phase", phase: "llm", iter });
    const raw = await chatCompletion(convo);
    emit({ kind: "llm_raw", content: raw });

    // 最終ステップではツール呼び出しを無視し、必ず最終ノートとして扱う。
    const call = forceSynthesis ? null : parseToolCall(raw);
    if (!call) {
      emit({ kind: "phase", phase: "final", iter });
      emit({ kind: "final", answer: raw });
      return { answer: raw, iterations: iter, events };
    }

    emit({ kind: "phase", phase: "tool_call", iter });
    emit({ kind: "tool_call", call });

    emit({ kind: "phase", phase: "tool_exec", iter });
    convo.push({ role: "assistant", content: raw });

    try {
      if (call.tool === "egov_search") {
        const candidates = await searchLawsByTitle(call.title);
        emit({
          kind: "egov_search_result",
          title: call.title,
          candidates,
        });
        emit({ kind: "phase", phase: "feedback", iter });
        convo.push({
          role: "user",
          content:
            `egov_search("${call.title}") の結果:\n` +
            (candidates.length === 0
              ? "0 件です。クエリを別の表記にリライトして再検索してください。"
              : candidates
                  .map(
                    (c) =>
                      `- ${c.lawTitle} (${c.lawNum}) [law_id=${c.lawId}]`,
                  )
                  .join("\n")) +
            "\n\n適切な法令が見つかったら egov_article で条文を取得してください。",
        });
      } else if (call.tool === "egov_article") {
        const art = await getArticleByLawTitle(
          call.law_title,
          call.article_num,
        );
        emit({
          kind: "egov_article_result",
          law_title: call.law_title,
          article_num: call.article_num,
          found: !!art,
          chars: art?.text.length ?? 0,
        });
        emit({ kind: "phase", phase: "feedback", iter });
        const sourceUrl = art
          ? `https://laws.e-gov.go.jp/law/${art.lawId}`
          : null;
        convo.push({
          role: "user",
          content: art
            ? `egov_article("${call.law_title}", ${call.article_num}) の本文:\n\n` +
              art.text +
              `\n\n出典: ${sourceUrl}`
            : `egov_article は該当条文を見つけられませんでした。条番号やクエリを見直してください。`,
        });
      } else if (call.tool === "fetch_page") {
        if (!isHostTrusted(call.url)) {
          emit({
            kind: "fetch_page_result",
            url: call.url,
            ok: false,
            status: 0,
            chars: 0,
          });
          emit({ kind: "phase", phase: "feedback", iter });
          convo.push({
            role: "user",
            content:
              `fetch_page("${call.url}") は信頼ホスト外のため実行を拒否しました。` +
              `許可されているホストは: ${[...TRUSTED_HOSTS].join(", ")}\n` +
              `捏造を疑い、システムプロンプトの検証済み URL から選び直すか、` +
              `egov_search/egov_article で法令側の情報に切り替えてください。`,
          });
        } else {
          const page: FetchedPage = await fetchPage(call.url, 4000);
          emit({
            kind: "fetch_page_result",
            url: page.url,
            ok: page.ok,
            status: page.status,
            chars: page.chars,
          });
          emit({ kind: "phase", phase: "feedback", iter });
          convo.push({
            role: "user",
            content:
              `fetch_page("${call.url}") の本文(${page.chars}字):\n\n` +
              page.text +
              `\n\nこの内容を根拠に、十分なら最終ノートをまとめてください。`,
          });
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      emit({ kind: "error", message: msg });
      convo.push({
        role: "user",
        content:
          `ツール実行でエラー: ${msg}\n` +
          `URL の捏造が原因の可能性が高いです。システムプロンプトに記載した` +
          `検証済み URL のみを使って fetch_page を呼び直すか、` +
          `egov_search/egov_article で代替してください。`,
      });
    }
  }

  // 最終ステップ(forceSynthesis)で必ず return するため通常ここには到達しない。
  // 型安全のための防御的フォールバック。
  emit({
    kind: "error",
    message: `MAX_STEPS=${MAX_STEPS} に達しました。最終回答に到達できませんでした。`,
  });
  return { answer: null, iterations: MAX_STEPS, events };
}
