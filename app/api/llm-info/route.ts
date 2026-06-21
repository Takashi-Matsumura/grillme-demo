import { getModelInfo } from "@/app/lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  const info = await getModelInfo();
  return Response.json(info);
}
