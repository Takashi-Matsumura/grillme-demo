import { describe, expect, it } from "vitest";
import {
  TRUSTED_HOSTS,
  TRUSTED_URLS,
  formatTrustedUrlsForPrompt,
  isHostTrusted,
  selectRelevantUrls,
} from "@/app/lib/trusted-urls";

describe("isHostTrusted", () => {
  it("accepts laws.e-gov.go.jp", () => {
    expect(isHostTrusted("https://laws.e-gov.go.jp/api/2/laws")).toBe(true);
  });

  it("accepts www.mhlw.go.jp", () => {
    expect(isHostTrusted("https://www.mhlw.go.jp/bunya/x.html")).toBe(true);
  });

  it("accepts www.kyoukaikenpo.or.jp", () => {
    expect(isHostTrusted("https://www.kyoukaikenpo.or.jp/g4/cat410/")).toBe(
      true,
    );
  });

  it("rejects fabricated lookalike domains", () => {
    expect(isHostTrusted("https://www.kyokai.sk.jp/kenko/index.html")).toBe(
      false,
    );
  });

  it("rejects mhlw subdomains not in the allow-list", () => {
    expect(isHostTrusted("https://hellowork.mhlw.go.jp/")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isHostTrusted("not a url")).toBe(false);
  });
});

describe("selectRelevantUrls", () => {
  it("always returns theme-agnostic URLs (e-Gov top, mhlw top)", () => {
    const urls = selectRelevantUrls("無関係なクエリ");
    expect(urls.map((u) => u.url)).toContain("https://laws.e-gov.go.jp/");
    expect(urls.map((u) => u.url)).toContain("https://www.mhlw.go.jp/");
  });

  it("includes 健診-specific URLs when query mentions 健診", () => {
    const urls = selectRelevantUrls("成人病予防健診");
    expect(urls.map((u) => u.url)).toContain(
      "https://www.kyoukaikenpo.or.jp/g4/cat410/",
    );
  });

  it("includes ハラスメント URL when query mentions パワハラ", () => {
    const urls = selectRelevantUrls("パワハラの社内相談窓口");
    expect(
      urls.some((u) =>
        u.description.includes("ハラスメント"),
      ),
    ).toBe(true);
  });

  it("excludes 健診-specific URL when query is unrelated", () => {
    const urls = selectRelevantUrls("育児休業");
    expect(urls.map((u) => u.url)).not.toContain(
      "https://www.kyoukaikenpo.or.jp/g4/cat410/",
    );
  });
});

describe("registry invariants", () => {
  it("every TRUSTED_URLS entry has a host in TRUSTED_HOSTS", () => {
    for (const entry of TRUSTED_URLS) {
      const host = new URL(entry.url).host;
      expect(TRUSTED_HOSTS.has(host), `${entry.url} host should be trusted`).toBe(
        true,
      );
    }
  });
});

describe("formatTrustedUrlsForPrompt", () => {
  it("renders one URL per line with description prefix", () => {
    const out = formatTrustedUrlsForPrompt([
      {
        url: "https://example.com/",
        description: "Example",
        themeKeywords: [],
      },
    ]);
    expect(out).toBe("  - Example: https://example.com/");
  });
});
