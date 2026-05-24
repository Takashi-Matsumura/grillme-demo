import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  deleteArchivedDomainKnowledge,
  deleteDomainKnowledge,
  domainKnowledgePath,
  formatDomainKnowledgeForPrompt,
  getArchivedDomainKnowledge,
  listArchivedDomainKnowledge,
  readDomainKnowledge,
  restoreArchivedDomainKnowledge,
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

describe("history / archive behavior", () => {
  const v1: DomainKnowledge = {
    query: "定期健康診断",
    content: "v1",
    iterations: 3,
    generatedAt: "2026-05-23T10:00:00.000Z",
  };
  const v2: DomainKnowledge = {
    query: "成人病予防健診",
    content: "v2",
    iterations: 5,
    generatedAt: "2026-05-24T10:00:00.000Z",
  };
  const v3: DomainKnowledge = {
    query: "生活習慣病予防健診",
    content: "v3",
    iterations: 4,
    generatedAt: "2026-05-25T10:00:00.000Z",
  };

  it("archives the previous version when a new one is saved", async () => {
    const { slug } = await createProject("hist1");
    await saveDomainKnowledge(slug, v1);
    expect(await listArchivedDomainKnowledge(slug)).toHaveLength(0);

    await saveDomainKnowledge(slug, v2);
    const archives = await listArchivedDomainKnowledge(slug);
    expect(archives).toHaveLength(1);
    expect(archives[0].query).toBe("定期健康診断");
  });

  it("keeps multiple archives across repeated saves", async () => {
    const { slug } = await createProject("hist-many");
    await saveDomainKnowledge(slug, v1);
    await saveDomainKnowledge(slug, v2);
    await saveDomainKnowledge(slug, v3);
    const archives = await listArchivedDomainKnowledge(slug);
    expect(archives.map((a) => a.query)).toEqual([
      "成人病予防健診", // v2 archived last
      "定期健康診断", // v1 archived first
    ]);
  });

  it("fetches a specific archive by id with full content", async () => {
    const { slug } = await createProject("hist-fetch");
    await saveDomainKnowledge(slug, v1);
    await saveDomainKnowledge(slug, v2);
    const archives = await listArchivedDomainKnowledge(slug);
    const detail = await getArchivedDomainKnowledge(slug, archives[0].id);
    expect(detail?.content).toBe("v1");
    expect(detail?.archivedAt).toBeTruthy();
  });

  it("deletes a specific archive", async () => {
    const { slug } = await createProject("hist-delete");
    await saveDomainKnowledge(slug, v1);
    await saveDomainKnowledge(slug, v2);
    const archives = await listArchivedDomainKnowledge(slug);
    expect(await deleteArchivedDomainKnowledge(slug, archives[0].id)).toBe(
      true,
    );
    expect(await listArchivedDomainKnowledge(slug)).toHaveLength(0);
  });

  it("restoring swaps current with an archived version", async () => {
    const { slug } = await createProject("hist-restore");
    await saveDomainKnowledge(slug, v1);
    await saveDomainKnowledge(slug, v2);
    // current = v2, history = [v1 archived]
    const v1ArchiveId = (await listArchivedDomainKnowledge(slug))[0].id;
    const restored = await restoreArchivedDomainKnowledge(slug, v1ArchiveId);
    expect(restored?.content).toBe("v1");

    // current = v1, history = [v2 archived, not v1]
    expect((await readDomainKnowledge(slug))?.content).toBe("v1");
    const after = await listArchivedDomainKnowledge(slug);
    expect(after).toHaveLength(1);
    expect(after[0].query).toBe("成人病予防健診");
  });

  it("rejects invalid archive ids", async () => {
    const { slug } = await createProject("hist-invalid");
    await saveDomainKnowledge(slug, v1);
    expect(await getArchivedDomainKnowledge(slug, "not-an-id")).toBeNull();
    expect(await deleteArchivedDomainKnowledge(slug, "not-an-id")).toBe(false);
    expect(await restoreArchivedDomainKnowledge(slug, "not-an-id")).toBeNull();
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
