// ドメイン下調べ Tool calling ループの SSE エンドポイント。
//
// 入力: { "query": "成人病予防健診" }
// 出力: SSE で phase / tool 結果 / 最終ノート を逐次配信。
// 本体ロジックは app/lib/research-loop.ts の runResearch にあり、
// このルートは SSE 化と入力バリデーションだけを担う。

import { type ResearchEvent, runResearch } from "@/app/lib/research-loop";

export const dynamic = "force-dynamic";

const MAX_QUERY_CHARS = 500;

export async function POST(req: Request) {
  let body: { query?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body.query !== "string" || !body.query.trim()) {
    return Response.json({ error: "query is required" }, { status: 400 });
  }
  if (body.query.length > MAX_QUERY_CHARS) {
    return Response.json(
      { error: `query too long (max ${MAX_QUERY_CHARS} chars)` },
      { status: 413 },
    );
  }
  const query = body.query.trim();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ResearchEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      };
      try {
        await runResearch(query, send);
      } catch (e) {
        send({
          kind: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        controller.enqueue(encoder.encode(`data: {"kind":"done"}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
