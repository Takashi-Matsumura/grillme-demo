import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteDomainKnowledge,
  domainKnowledgePath,
  formatDomainKnowledgeForPrompt,
  readDomainKnowledge,
  saveDomainKnowledge,
  type DomainKnowledge,
} from "@/app/lib/domain-knowledge";
import { createProject } from "@/app/lib/projects";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "ops-grill-dk-test-"));
  process.env.OPS_GRILL_ANALYSES_DIR = workDir;
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
  delete process.env.OPS_GRILL_ANALYSES_DIR;
});

const sample: Omit<DomainKnowledge, "generatedAt"> = {
  query: "成人病予防健診",
  content: "## 法令上の根拠\n- 安衛則第44条\n",
  iterations: 4,
};

describe("saveDomainKnowledge / readDomainKnowledge", () => {
  it("round-trips a domain knowledge JSON for an existing project", async () => {
    const meta = await createProject("成人病予防健診");
    const dk: DomainKnowledge = {
      ...sample,
      generatedAt: "2026-05-24T11:00:00.000Z",
    };
    await saveDomainKnowledge(meta.slug, dk);
    const loaded = await readDomainKnowledge(meta.slug);
    expect(loaded).toEqual(dk);
  });

  it("returns null when no domain knowledge file exists", async () => {
    const meta = await createProject("empty");
    expect(await readDomainKnowledge(meta.slug)).toBeNull();
  });

  it("returns null for invalid slugs without touching the filesystem", async () => {
    expect(await readDomainKnowledge("../etc/passwd")).toBeNull();
  });

  it("rejects saving under an invalid slug", async () => {
    await expect(
      saveDomainKnowledge("../etc/passwd", {
        ...sample,
        generatedAt: "x",
      }),
    ).rejects.toThrow();
  });
});

describe("deleteDomainKnowledge", () => {
  it("removes the file and makes read return null", async () => {
    const meta = await createProject("delete-test");
    await saveDomainKnowledge(meta.slug, { ...sample, generatedAt: "x" });
    expect(await readDomainKnowledge(meta.slug)).not.toBeNull();
    await deleteDomainKnowledge(meta.slug);
    expect(await readDomainKnowledge(meta.slug)).toBeNull();
  });

  it("is a no-op when the file does not exist", async () => {
    const meta = await createProject("noop-test");
    await deleteDomainKnowledge(meta.slug);
    expect(await readDomainKnowledge(meta.slug)).toBeNull();
  });
});

describe("domainKnowledgePath", () => {
  it("uses domain_knowledge.json inside the project directory", () => {
    const p = domainKnowledgePath("2026-05-24-x");
    expect(path.basename(p)).toBe("domain_knowledge.json");
  });
});

describe("formatDomainKnowledgeForPrompt", () => {
  it("includes the query, the content, and the generated timestamp", () => {
    const dk: DomainKnowledge = {
      query: "成人病予防健診",
      content: "## 法令上の根拠\n- 安衛則第44条",
      iterations: 4,
      generatedAt: "2026-05-24T11:00:00.000Z",
    };
    const out = formatDomainKnowledgeForPrompt(dk);
    expect(out).toContain("成人病予防健診");
    expect(out).toContain("安衛則第44条");
    expect(out).toContain("2026-05-24T11:00:00.000Z");
  });
});
