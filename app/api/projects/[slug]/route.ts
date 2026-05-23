import { deleteProject, isValidSlug } from "@/app/lib/projects";

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
