import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ArchivedSession,
  Message,
  Phase,
  PhaseConversation,
  ProjectMeta,
  SessionMeta,
} from "@/app/lib/types";

export type {
  ArchivedSession,
  Message,
  Phase,
  PhaseConversation,
  ProjectMeta,
  SessionMeta,
};
export { PHASES } from "@/app/lib/types";

const ANALYSES_DIR = path.join(process.cwd(), "analyses");

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === "string" && SLUG_RE.test(slug);
}

export function isValidPhase(phase: unknown): phase is Phase {
  return phase === "b-pre" || phase === "c" || phase === "b-post";
}

export function projectDir(slug: string): string {
  return path.join(ANALYSES_DIR, slug);
}

export function projectMetaPath(slug: string): string {
  return path.join(projectDir(slug), "project.json");
}

export function phaseFilePath(slug: string, phase: Phase): string {
  return path.join(projectDir(slug), `${phase}.json`);
}

export function phaseHistoryPath(slug: string, phase: Phase): string {
  return path.join(projectDir(slug), `${phase}.history.json`);
}

const SESSION_ID_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}Z$/;

export function isValidSessionId(id: unknown): id is string {
  return typeof id === "string" && SESSION_ID_RE.test(id);
}

function makeSessionId(timestamp?: string): string {
  const iso = timestamp ?? new Date().toISOString();
  return `${iso.replace(/:/g, "-").slice(0, 19)}Z`;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureAnalysesDir(): Promise<void> {
  await mkdir(ANALYSES_DIR, { recursive: true });
}

async function readJsonFile<T>(p: string): Promise<T | null> {
  try {
    const raw = await readFile(p, "utf-8");
    return JSON.parse(raw) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

async function writeJsonFile(p: string, data: unknown): Promise<void> {
  await writeFile(p, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
}

function todayPrefix(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function asciifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

async function generateUniqueSlug(name: string): Promise<string> {
  const prefix = todayPrefix();
  await ensureAnalysesDir();
  const ascii = asciifyName(name);
  const base = ascii ? `${prefix}-${ascii}` : prefix;

  if (!(await pathExists(projectDir(base)))) return base;
  let n = 2;
  while (await pathExists(projectDir(`${base}-${n}`))) n++;
  return `${base}-${n}`;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  await ensureAnalysesDir();
  let entries: string[];
  try {
    entries = await readdir(ANALYSES_DIR);
  } catch {
    return [];
  }
  const projects: ProjectMeta[] = [];
  for (const entry of entries) {
    if (!isValidSlug(entry)) continue;
    const meta = await readJsonFile<ProjectMeta>(projectMetaPath(entry));
    if (meta) projects.push(meta);
  }
  projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return projects;
}

export async function createProject(name: string): Promise<ProjectMeta> {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("name is required");
  }
  const trimmed = name.trim().slice(0, 100);
  const slug = await generateUniqueSlug(trimmed);
  await mkdir(projectDir(slug), { recursive: true });
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    slug,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  };
  await writeJsonFile(projectMetaPath(slug), meta);
  return meta;
}

export async function deleteProject(slug: string): Promise<boolean> {
  if (!isValidSlug(slug)) return false;
  if (!(await pathExists(projectDir(slug)))) return false;
  await rm(projectDir(slug), { recursive: true, force: true });
  return true;
}

export async function renameProject(
  slug: string,
  newName: string,
): Promise<ProjectMeta> {
  if (!isValidSlug(slug)) throw new Error("invalid slug");
  const trimmed = (newName ?? "").trim().slice(0, 100);
  if (!trimmed) throw new Error("name is required");
  const meta = await readJsonFile<ProjectMeta>(projectMetaPath(slug));
  if (!meta) throw new Error("project not found");
  meta.name = trimmed;
  meta.updatedAt = new Date().toISOString();
  await writeJsonFile(projectMetaPath(slug), meta);
  return meta;
}

async function touchProject(slug: string): Promise<void> {
  const meta = await readJsonFile<ProjectMeta>(projectMetaPath(slug));
  if (!meta) return;
  meta.updatedAt = new Date().toISOString();
  await writeJsonFile(projectMetaPath(slug), meta);
}

export async function getPhaseConversation(
  slug: string,
  phase: Phase,
): Promise<PhaseConversation> {
  const conv = await readJsonFile<PhaseConversation>(phaseFilePath(slug, phase));
  return conv ?? { messages: [], updatedAt: "" };
}

export async function savePhaseConversation(
  slug: string,
  phase: Phase,
  messages: Message[],
): Promise<PhaseConversation> {
  if (!(await pathExists(projectDir(slug)))) {
    throw new Error("project not found");
  }
  const existing = await readJsonFile<PhaseConversation>(
    phaseFilePath(slug, phase),
  );
  const now = new Date().toISOString();
  const conv: PhaseConversation = {
    messages,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeJsonFile(phaseFilePath(slug, phase), conv);
  await touchProject(slug);
  return conv;
}

async function loadPhaseHistory(
  slug: string,
  phase: Phase,
): Promise<ArchivedSession[] | null> {
  return readJsonFile<ArchivedSession[]>(phaseHistoryPath(slug, phase));
}

export async function listSessionHistory(
  slug: string,
  phase: Phase,
): Promise<SessionMeta[]> {
  if (!isValidSlug(slug) || !isValidPhase(phase)) return [];
  const history = await loadPhaseHistory(slug, phase);
  if (!history) return [];
  return history
    .map((h) => ({
      id: h.id,
      createdAt: h.createdAt,
      updatedAt: h.updatedAt,
      messageCount: h.messages.length,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getArchivedSession(
  slug: string,
  phase: Phase,
  sessionId: string,
): Promise<ArchivedSession | null> {
  if (
    !isValidSlug(slug) ||
    !isValidPhase(phase) ||
    !isValidSessionId(sessionId)
  ) {
    return null;
  }
  const history = await loadPhaseHistory(slug, phase);
  return history?.find((h) => h.id === sessionId) ?? null;
}

export async function archiveAndStartNewSession(
  slug: string,
  phase: Phase,
): Promise<{ archivedId: string | null }> {
  if (!isValidSlug(slug) || !isValidPhase(phase)) {
    throw new Error("invalid slug or phase");
  }
  const current = await readJsonFile<PhaseConversation>(
    phaseFilePath(slug, phase),
  );
  if (!current || current.messages.length === 0) {
    await rm(phaseFilePath(slug, phase), { force: true });
    await touchProject(slug);
    return { archivedId: null };
  }
  const id = makeSessionId(current.createdAt ?? current.updatedAt);
  const history = (await loadPhaseHistory(slug, phase)) ?? [];
  history.push({
    id,
    messages: current.messages,
    createdAt: current.createdAt ?? current.updatedAt,
    updatedAt: current.updatedAt,
  });
  await writeJsonFile(phaseHistoryPath(slug, phase), history);
  await rm(phaseFilePath(slug, phase), { force: true });
  await touchProject(slug);
  return { archivedId: id };
}

export async function deleteArchivedSession(
  slug: string,
  phase: Phase,
  sessionId: string,
): Promise<boolean> {
  if (
    !isValidSlug(slug) ||
    !isValidPhase(phase) ||
    !isValidSessionId(sessionId)
  ) {
    return false;
  }
  const history = await loadPhaseHistory(slug, phase);
  if (!history) return false;
  const filtered = history.filter((h) => h.id !== sessionId);
  if (filtered.length === history.length) return false;
  if (filtered.length === 0) {
    await rm(phaseHistoryPath(slug, phase), { force: true });
  } else {
    await writeJsonFile(phaseHistoryPath(slug, phase), filtered);
  }
  await touchProject(slug);
  return true;
}

export async function clearPhaseConversation(
  slug: string,
  phase: Phase,
): Promise<void> {
  await rm(phaseFilePath(slug, phase), { force: true });
  await touchProject(slug);
}

const PHASE_PREDECESSORS: Record<Phase, Phase[]> = {
  "b-pre": [],
  c: ["b-pre"],
  "b-post": ["b-pre", "c"],
};

const PHASE_LABEL: Record<Phase, string> = {
  "b-pre": "Phase B-pre（ヒアリング前準備）",
  c: "Phase C（ヒアリング中の伴走）",
  "b-post": "Phase B-post（事後整理）",
};

function lastAssistantContent(messages: Message[]): string | null {
  const last = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content.trim().length > 0);
  return last ? last.content : null;
}

async function findLatestAssistantOutput(
  slug: string,
  phase: Phase,
): Promise<string | null> {
  // Prefer the current session if it has an assistant message.
  const current = await getPhaseConversation(slug, phase);
  const fromCurrent = lastAssistantContent(current.messages);
  if (fromCurrent) return fromCurrent;
  // Otherwise fall back to the most recent archived session that has one.
  const history = await loadPhaseHistory(slug, phase);
  if (!history) return null;
  const sorted = [...history].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  for (const arch of sorted) {
    const fromArch = lastAssistantContent(arch.messages);
    if (fromArch) return fromArch;
  }
  return null;
}

export async function buildPreviousPhaseContext(
  slug: string,
  phase: Phase,
): Promise<string | null> {
  const predecessors = PHASE_PREDECESSORS[phase];
  if (predecessors.length === 0) return null;

  const sections: string[] = [];
  for (const prev of predecessors) {
    const output = await findLatestAssistantOutput(slug, prev);
    if (!output) continue;
    sections.push(`### ${PHASE_LABEL[prev]} の最終出力\n\n${output}`);
  }
  if (sections.length === 0) return null;
  return `## このプロジェクトの過去フェーズ出力\n\n${sections.join("\n\n")}`;
}
