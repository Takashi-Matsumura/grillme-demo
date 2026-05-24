import { restoreArchivedDomainKnowledge } from "@/app/lib/domain-knowledge";
import { isValidSessionId, isValidSlug } from "@/app/lib/projects";

export async function POST(
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
  const dk = await restoreArchivedDomainKnowledge(slug, id);
  if (!dk) {
    return Response.json({ error: "archive not found" }, { status: 404 });
  }
  return Response.json({ domainKnowledge: dk });
}
