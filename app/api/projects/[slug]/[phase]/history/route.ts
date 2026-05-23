import {
  archiveAndStartNewSession,
  isValidPhase,
  isValidSlug,
  listSessionHistory,
  type Phase,
} from "@/app/lib/projects";

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
  const sessions = await listSessionHistory(v.slug, v.phase);
  return Response.json({ sessions });
}

export async function POST(_req: Request, ctx: { params: Promise<Params> }) {
  const v = await validate(ctx);
  if ("error" in v) return Response.json({ error: v.error }, { status: v.status });
  try {
    const result = await archiveAndStartNewSession(v.slug, v.phase);
    return Response.json(result, { status: 201 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
