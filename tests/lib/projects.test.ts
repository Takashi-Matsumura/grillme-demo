import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  archiveAndStartNewSession,
  buildPreviousPhaseContext,
  createProject,
  deleteArchivedSession,
  deleteProject,
  getArchivedSession,
  getPhaseConversation,
  isValidPhase,
  isValidSessionId,
  isValidSlug,
  listProjects,
  listSessionHistory,
  phaseFilePath,
  phaseHistoryPath,
  projectDir,
  savePhaseConversation,
} from "@/app/lib/projects";

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "ops-grill-test-"));
  process.env.OPS_GRILL_ANALYSES_DIR = workDir;
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
  delete process.env.OPS_GRILL_ANALYSES_DIR;
});

describe("validators", () => {
  it("isValidSlug accepts simple ASCII slugs", () => {
    expect(isValidSlug("2026-05-23-payroll")).toBe(true);
    expect(isValidSlug("a")).toBe(true);
    expect(isValidSlug("2026-05-23")).toBe(true);
  });

  it("isValidSlug rejects path traversal and exotic characters", () => {
    expect(isValidSlug("../etc/passwd")).toBe(false);
    expect(isValidSlug("UPPER")).toBe(false);
    expect(isValidSlug("with space")).toBe(false);
    expect(isValidSlug("ja日本語")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("-leading-hyphen")).toBe(false);
    expect(isValidSlug(null)).toBe(false);
  });

  it("isValidPhase accepts the three known phases", () => {
    expect(isValidPhase("b-pre")).toBe(true);
    expect(isValidPhase("c")).toBe(true);
    expect(isValidPhase("b-post")).toBe(true);
    expect(isValidPhase("d-other")).toBe(false);
  });

  it("isValidSessionId requires the YYYY-MM-DDTHH-MM-SSZ form", () => {
    expect(isValidSessionId("2026-05-23T19-30-00Z")).toBe(true);
    expect(isValidSessionId("2026-05-23T19:30:00Z")).toBe(false);
    expect(isValidSessionId("notavalidid")).toBe(false);
  });
});

describe("createProject + listProjects", () => {
  it("creates a project directory with project.json", async () => {
    const meta = await createProject("月次給与計算");
    expect(meta.name).toBe("月次給与計算");
    expect(isValidSlug(meta.slug)).toBe(true);
    const raw = await readFile(
      path.join(projectDir(meta.slug), "project.json"),
      "utf-8",
    );
    expect(JSON.parse(raw)).toMatchObject({
      slug: meta.slug,
      name: "月次給与計算",
    });
  });

  it("generates distinct slugs when the same name is created twice", async () => {
    const a = await createProject("payroll");
    const b = await createProject("payroll");
    expect(a.slug).not.toBe(b.slug);
  });

  it("listProjects returns projects sorted by updatedAt desc", async () => {
    const a = await createProject("alpha");
    // small delay so updatedAt differs
    await new Promise((r) => setTimeout(r, 5));
    const b = await createProject("beta");
    const list = await listProjects();
    expect(list.map((p) => p.slug)).toEqual([b.slug, a.slug]);
  });

  it("deleteProject removes the directory", async () => {
    const meta = await createProject("doomed");
    expect(await deleteProject(meta.slug)).toBe(true);
    expect((await listProjects()).find((p) => p.slug === meta.slug)).toBeUndefined();
  });
});

describe("savePhaseConversation", () => {
  it("creates createdAt on first save and preserves it on second save", async () => {
    const { slug } = await createProject("save-test");
    const first = await savePhaseConversation(slug, "b-pre", [
      { role: "user", content: "hi" },
    ]);
    expect(first.createdAt).toBeDefined();
    await new Promise((r) => setTimeout(r, 5));
    const second = await savePhaseConversation(slug, "b-pre", [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
  });

  it("throws when the project does not exist", async () => {
    await expect(
      savePhaseConversation("does-not-exist", "b-pre", [
        { role: "user", content: "hi" },
      ]),
    ).rejects.toThrow(/project not found/);
  });
});

describe("archive + history flow", () => {
  it("archives current and starts new, then lists/reads/deletes archive", async () => {
    const { slug } = await createProject("archive-test");
    await savePhaseConversation(slug, "b-pre", [
      { role: "user", content: "v1" },
      { role: "assistant", content: "reply v1" },
    ]);
    const { archivedId } = await archiveAndStartNewSession(slug, "b-pre");
    expect(archivedId).not.toBeNull();

    // current is now empty
    const current = await getPhaseConversation(slug, "b-pre");
    expect(current.messages).toEqual([]);

    const list = await listSessionHistory(slug, "b-pre");
    expect(list).toHaveLength(1);
    expect(list[0].messageCount).toBe(2);
    expect(list[0].id).toBe(archivedId);

    const arch = await getArchivedSession(slug, "b-pre", archivedId as string);
    expect(arch?.messages).toEqual([
      { role: "user", content: "v1" },
      { role: "assistant", content: "reply v1" },
    ]);

    expect(await deleteArchivedSession(slug, "b-pre", archivedId as string)).toBe(
      true,
    );
    expect(await listSessionHistory(slug, "b-pre")).toEqual([]);
  });

  it("archives nothing when current is empty (no-op)", async () => {
    const { slug } = await createProject("empty-archive");
    const result = await archiveAndStartNewSession(slug, "b-pre");
    expect(result.archivedId).toBeNull();
    expect(await listSessionHistory(slug, "b-pre")).toEqual([]);
  });

  it("rejects an invalid sessionId on get/delete", async () => {
    const { slug } = await createProject("bad-id");
    expect(await getArchivedSession(slug, "b-pre", "bogus")).toBeNull();
    expect(await deleteArchivedSession(slug, "b-pre", "bogus")).toBe(false);
  });
});

describe("buildPreviousPhaseContext", () => {
  it("returns null when the requested phase has no predecessors", async () => {
    const { slug } = await createProject("pre-ctx");
    expect(await buildPreviousPhaseContext(slug, "b-pre")).toBeNull();
  });

  it("uses current session of predecessor when available", async () => {
    const { slug } = await createProject("pre-ctx");
    await savePhaseConversation(slug, "b-pre", [
      { role: "user", content: "?" },
      { role: "assistant", content: "B-pre 最終出力" },
    ]);
    const ctx = await buildPreviousPhaseContext(slug, "c");
    expect(ctx).toContain("B-pre 最終出力");
  });

  it("falls back to latest archived session when current is empty", async () => {
    const { slug } = await createProject("pre-ctx");
    await savePhaseConversation(slug, "b-pre", [
      { role: "user", content: "?" },
      { role: "assistant", content: "アーカイブされた B-pre 出力" },
    ]);
    await archiveAndStartNewSession(slug, "b-pre");
    const ctx = await buildPreviousPhaseContext(slug, "c");
    expect(ctx).toContain("アーカイブされた B-pre 出力");
  });

  it("returns null when neither current nor history has an assistant message", async () => {
    const { slug } = await createProject("pre-ctx");
    await savePhaseConversation(slug, "b-pre", [
      { role: "user", content: "no assistant reply yet" },
    ]);
    expect(await buildPreviousPhaseContext(slug, "c")).toBeNull();
  });
});

describe("file paths", () => {
  it("phaseFilePath / phaseHistoryPath stay inside the analyses dir", () => {
    const slug = "2026-05-23-x";
    const p1 = phaseFilePath(slug, "b-pre");
    const p2 = phaseHistoryPath(slug, "b-pre");
    expect(p1.startsWith(workDir)).toBe(true);
    expect(p2.startsWith(workDir)).toBe(true);
    expect(p1.endsWith("b-pre.json")).toBe(true);
    expect(p2.endsWith("b-pre.history.json")).toBe(true);
  });
});
