import {
  deleteArchivedSession,
  getArchivedSession,
  isValidPhase,
  isValidSessionId,
  isValidSlug,
  type Phase,
} from "@/app/lib/projects";

type Params = { slug: string; phase: string; sessionId: string };

async function validate(ctx: { params: Promise<Params> }): Promise<
  | { slug: string; phase: Phase; sessionId: string }
  | { error: string; status: number }
> {
  const { slug, phase, sessionId } = await ctx.params;
  if (!isValidSlug(slug)) return { error: "invalid slug", status: 400 };
  if (!isValidPhase(phase)) return { error: "invalid phase", status: 400 };
  if (!isValidSessionId(sessionId)) {
    return { error: "invalid sessionId", status: 400 };
  }
  return { slug, phase, sessionId };
}

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const v = await validate(ctx);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });
  const session = await getArchivedSession(v.slug, v.phase, v.sessionId);
  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  return Response.json({ session });
}

export async function DELETE(_req: Request, ctx: { params: Promise<Params> }) {
  const v = await validate(ctx);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });
  const ok = await deleteArchivedSession(v.slug, v.phase, v.sessionId);
  if (!ok) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
