// プロジェクトのドメイン知識ノートを取得・削除する。
// 生成 (POST 相当) は /api/research に projectSlug 付きで叩く方式で
// 既に実装済みなので、ここでは扱わない。

import {
  deleteDomainKnowledge,
  readDomainKnowledge,
} from "@/app/lib/domain-knowledge";
import { isValidSlug } from "@/app/lib/projects";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) {
    return Response.json({ error: "invalid slug" }, { status: 400 });
  }
  const dk = await readDomainKnowledge(slug);
  if (!dk) {
    return Response.json({ domainKnowledge: null }, { status: 200 });
  }
  return Response.json({ domainKnowledge: dk });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  if (!isValidSlug(slug)) {
    return Response.json({ error: "invalid slug" }, { status: 400 });
  }
  await deleteDomainKnowledge(slug);
  return Response.json({ ok: true });
}
