import { deleteProject, isValidSlug, renameProject } from "@/app/lib/projects";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) {
    return Response.json({ error: "invalid slug" }, { status: 400 });
  }
  const ok = await deleteProject(slug);
  if (!ok) {
    return Response.json({ error: "project not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) {
    return Response.json({ error: "invalid slug" }, { status: 400 });
  }
  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }
  try {
    const meta = await renameProject(slug, body.name);
    return Response.json({ project: meta });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "project not found" ? 404 : 500;
    return Response.json({ error: msg }, { status });
  }
}
