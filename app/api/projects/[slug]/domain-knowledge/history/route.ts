import { listArchivedDomainKnowledge } from "@/app/lib/domain-knowledge";
import { isValidSlug } from "@/app/lib/projects";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) {
    return Response.json({ error: "invalid slug" }, { status: 400 });
  }
  const archives = await listArchivedDomainKnowledge(slug);
  return Response.json({ archives });
}
