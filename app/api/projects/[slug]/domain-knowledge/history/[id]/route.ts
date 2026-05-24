import {
  deleteArchivedDomainKnowledge,
  getArchivedDomainKnowledge,
} from "@/app/lib/domain-knowledge";
import { isValidSessionId, isValidSlug } from "@/app/lib/projects";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  if (!isValidSlug(slug)) {
    return Response.json({ error: "invalid slug" }, { status: 400 });
  }
  if (!isValidSessionId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const archive = await getArchivedDomainKnowledge(slug, id);
  if (!archive) {
    return Response.json({ error: "archive not found" }, { status: 404 });
  }
  return Response.json({ archive });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await ctx.params;
  if (!isValidSlug(slug)) {
    return Response.json({ error: "invalid slug" }, { status: 400 });
  }
  if (!isValidSessionId(id)) {
    return Response.json({ error: "invalid id" }, { status: 400 });
  }
  const ok = await deleteArchivedDomainKnowledge(slug, id);
  if (!ok) {
    return Response.json({ error: "archive not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
