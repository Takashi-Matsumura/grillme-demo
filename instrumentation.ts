// Next.js instrumentation hook (server-side のみ実行).
// Node.js 標準の fetch (undici ベース) は HTTP_PROXY 環境変数を自動で読まない。
// EnvHttpProxyAgent をグローバル dispatcher に設定することで、
// egov.ts / fetch-page.ts の fetch 呼び出しがプロキシ経由になる。
export async function register() {
  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (!proxy) return;
  try {
    const { setGlobalDispatcher, EnvHttpProxyAgent } = await import('undici');
    setGlobalDispatcher(new EnvHttpProxyAgent());
  } catch {
    // undici が利用できない環境ではスキップ
  }
}
