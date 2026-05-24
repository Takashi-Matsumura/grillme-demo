import { describe, expect, it } from "vitest";
import { parseToolCall } from "@/app/lib/research-loop";

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
