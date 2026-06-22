import { describe, expect, it, vi } from "vitest";
import { parseToolCall, runResearch } from "@/app/lib/research-loop";

// runResearch のループ制御だけを検証したいので、外部依存はすべてモックする。
const chatCompletion = vi.hoisted(() => vi.fn());
vi.mock("@/app/lib/llm", () => ({ chatCompletion }));
vi.mock("@/app/lib/egov", () => ({
  searchLawsByTitle: vi.fn(async () => []),
  getArticleByLawTitle: vi.fn(async () => null),
}));
vi.mock("@/app/lib/fetch-page", () => ({
  fetchPage: vi.fn(async () => ({ url: "", ok: true, status: 200, text: "", chars: 0 })),
}));

describe("parseToolCall", () => {
  it("parses egov_search", () => {
    expect(
      parseToolCall('{"tool":"egov_search","title":"労働安全衛生規則"}'),
    ).toEqual({ tool: "egov_search", title: "労働安全衛生規則" });
  });

  it("parses egov_article with number article_num", () => {
    expect(
      parseToolCall(
        '{"tool":"egov_article","law_title":"労働安全衛生規則","article_num":44}',
      ),
    ).toEqual({
      tool: "egov_article",
      law_title: "労働安全衛生規則",
      article_num: 44,
    });
  });

  it("parses egov_article with string article_num", () => {
    expect(
      parseToolCall(
        '{"tool":"egov_article","law_title":"労働安全衛生規則","article_num":"44"}',
      ),
    ).toEqual({
      tool: "egov_article",
      law_title: "労働安全衛生規則",
      article_num: 44,
    });
  });

  it("parses fetch_page with https url", () => {
    expect(
      parseToolCall('{"tool":"fetch_page","url":"https://example.com/x"}'),
    ).toEqual({ tool: "fetch_page", url: "https://example.com/x" });
  });

  it("strips ```json fences", () => {
    const raw = '```json\n{"tool":"egov_search","title":"X"}\n```';
    expect(parseToolCall(raw)).toEqual({ tool: "egov_search", title: "X" });
  });

  it("returns null for plain markdown answer", () => {
    expect(parseToolCall("## 法令上の根拠\n- 安衛則第44条")).toBeNull();
  });

  it("returns null for invalid tool name", () => {
    expect(parseToolCall('{"tool":"unknown","x":"y"}')).toBeNull();
  });

  it("returns null for fetch_page without http(s) scheme", () => {
    expect(
      parseToolCall('{"tool":"fetch_page","url":"file:///etc/passwd"}'),
    ).toBeNull();
  });

  it("returns null for empty title", () => {
    expect(parseToolCall('{"tool":"egov_search","title":""}')).toBeNull();
  });
});

describe("runResearch step budget", () => {
  it("forces a final note instead of failing when the step limit is hit", async () => {
    // LLM が毎回ツール呼び出しを返し続けても、最終ステップで強制まとめに
    // 切り替わり、answer が null にならず収集成果を捨てないことを検証する。
    chatCompletion.mockReset();
    chatCompletion.mockResolvedValue(
      '{"tool":"egov_search","title":"労働基準法"}',
    );

    const result = await runResearch("総務部業務 固定資産管理");

    expect(result.answer).not.toBeNull();
    expect(result.iterations).toBe(9); // MAX_STEPS
    expect(chatCompletion).toHaveBeenCalledTimes(9);
    expect(result.events.some((e) => e.kind === "final")).toBe(true);
    expect(
      result.events.some(
        (e) => e.kind === "error" && e.message.includes("MAX_STEPS"),
      ),
    ).toBe(false);
  });

  it("returns the markdown answer as soon as the LLM stops calling tools", async () => {
    chatCompletion.mockReset();
    chatCompletion
      .mockResolvedValueOnce('{"tool":"egov_search","title":"労働基準法"}')
      .mockResolvedValueOnce("## 法令上の根拠\n- 労基法第89条");

    const result = await runResearch("就業規則");

    expect(result.answer).toContain("## 法令上の根拠");
    expect(result.iterations).toBe(2);
    expect(chatCompletion).toHaveBeenCalledTimes(2);
  });
});
