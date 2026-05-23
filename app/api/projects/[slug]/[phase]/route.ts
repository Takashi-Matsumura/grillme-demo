import {
  clearPhaseConversation,
  getPhaseConversation,
  isValidPhase,
  isValidSlug,
  type Message,
  type Phase,
  savePhaseConversation,
} from "@/app/lib/projects";
import { validateMessages } from "@/app/lib/validation";

type Params = { slug: string; phase: string };

async function validate(ctx: { params: Promise<Params> }): Promise<
  { slug: string; phase: Phase } | { error: string; status: number }
> {
  const { slug, phase } = await ctx.params;
  if (!isValidSlug(slug)) return { error: "invalid slug", status: 400 };
  if (!isValidPhase(phase)) return { error: "invalid phase", status: 400 };
  return { slug, phase };
}

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const v = await validate(ctx);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });
  const conv = await getPhaseConversation(v.slug, v.phase);
  return Response.json({ conversation: conv });
}

export async function PUT(req: Request, ctx: { params: Promise<Params> }) {
  const v = await validate(ctx);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const result = validateMessages(body.messages);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  try {
    const conv = await savePhaseConversation(
      v.slug,
      v.phase,
      result.messages as Message[],
    );
    return Response.json({ conversation: conv });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "project not found" ? 404 : 500;
    return Response.json({ error: msg }, { status });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<Params> }) {
  const v = await validate(ctx);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });
  await clearPhaseConversation(v.slug, v.phase);
  return Response.json({ ok: true });
}
