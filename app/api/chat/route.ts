import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  buildPreviousPhaseContext,
  isValidPhase,
  isValidSlug,
} from "@/app/lib/projects";

const LLAMA_BASE_URL = process.env.LLAMA_BASE_URL ?? "http://localhost:8080";
const MODEL_NAME = process.env.LLAMA_MODEL ?? "gemma";
const SKILL_PATH = path.join(
  process.cwd(),
  ".claude/skills/ops-grill/SKILL.md",
);

let cachedSkill: string | null = null;

async function loadSkill(): Promise<string> {
  if (cachedSkill !== null) return cachedSkill;
  cachedSkill = await readFile(SKILL_PATH, "utf-8");
  return cachedSkill;
}

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

export async function POST(req: Request) {
  let body: {
    messages?: ChatMessage[];
    projectSlug?: unknown;
    phase?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const messages = body.messages ?? [];
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages required" }, { status: 400 });
  }

  let systemPrompt: string;
  try {
    systemPrompt = await loadSkill();
  } catch {
    return Response.json(
      { error: `ops-grill SKILL.md not found at ${SKILL_PATH}` },
      { status: 500 },
    );
  }

  if (isValidSlug(body.projectSlug) && isValidPhase(body.phase)) {
    try {
      const previous = await buildPreviousPhaseContext(
        body.projectSlug,
        body.phase,
      );
      if (previous) {
        systemPrompt = `${systemPrompt}\n\n---\n\n${previous}`;
      }
    } catch {
      // ignore — chat should still proceed even if previous context fails to load
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL_NAME,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
      }),
    });
  } catch (e) {
    return Response.json(
      {
        error: `llama.cpp に接続できませんでした (${LLAMA_BASE_URL})。サーバが起動しているか確認してください。`,
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return Response.json(
      { error: `llama.cpp returned ${upstream.status}`, detail: text },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
