import { describe, expect, it } from "vitest";
import { buildTitleVariants } from "@/app/lib/egov";

describe("buildTitleVariants", () => {
  it("includes the original title first", () => {
    expect(buildTitleVariants("労働安全衛生規則")[0]).toBe("労働安全衛生規則");
  });

  it("converts 中黒 to 読点", () => {
    expect(buildTitleVariants("A・B・C法")).toContain("A、B、C法");
  });

  it("converts 読点 to 中黒", () => {
    expect(buildTitleVariants("A、B、C法")).toContain("A・B・C法");
  });

  it("chops at 等 to recover a matchable core phrase", () => {
    // e-Gov はフルネームの「育児・介護休業等育児又は家族介護を行う…」
    // で 0 件だが、「育児・介護休業」で 3 件マッチする。
    expect(
      buildTitleVariants(
        "育児・介護休業等育児又は家族介護を行う労働者の福祉に関する法律",
      ),
    ).toContain("育児・介護休業");
  });

  it("chops at 又は", () => {
    expect(buildTitleVariants("AAA又はBBB")).toContain("AAA");
  });

  it("chops at に関する", () => {
    expect(buildTitleVariants("XX法律に関する規則")).toContain("XX法律");
  });

  it("strips all punctuation as a last resort", () => {
    expect(buildTitleVariants("育児・介護休業法")).toContain("育児介護休業法");
  });

  it("dedupes when the title has no variation to make", () => {
    expect(buildTitleVariants("労働安全衛生規則").length).toBe(1);
  });

  it("trims surrounding whitespace", () => {
    expect(buildTitleVariants("  労働安全衛生規則  ")[0]).toBe(
      "労働安全衛生規則",
    );
  });
});
