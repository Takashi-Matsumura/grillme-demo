# 社内プロキシ環境での Colima コンテナ インターネット接続設定

macOS 上の Colima（Docker 互換コンテナランタイム）を社内ネットワーク環境で使う場合、
コンテナからインターネットへアクセスするために追加の設定が必要になることがある。
本ドキュメントはその仕組みと設定手順を記録する。

## 問題の背景

### なぜコンテナから外部に繋がらないのか

社内ネットワーク環境では、インターネットへのアクセスが **HTTP プロキシ経由** に限定されていることがある。
macOS ホスト側では `HTTP_PROXY` 等の環境変数が設定されており、
ブラウザやターミナルの通信はこのプロキシを経由して外部に届く。

しかし **Colima の Docker コンテナは別の問題**を抱えている:

```
[コンテナ] → proxy.internal:8080 → インターネット  ← ✗ 直接届かない
[Mac ホスト] → proxy.internal:8080 → インターネット ← ✓ 届く
```

Colima VM のネットワーク（NAT ブリッジ）からプロキシサーバへの TCP 接続が通らない。
プロキシ自体はホスト上のプロセスからは到達可能なため、
**Mac ホストプロセスをリレーとして噛ませる**ことで解決できる。

### Node.js の追加問題

さらに、Node.js 標準の `fetch`（undici ベース）は
**`HTTP_PROXY` 環境変数を自動では読まない**という挙動がある。
Python の `requests` / `httpx` 等は自動で読むが、Node.js だけは明示的な設定が必要。

---

## 解決策のアーキテクチャ

```
┌─────────────────────────── macOS ホスト ───────────────────────────┐
│                                                                   │
│  proxy-relay.js (Node.js, launchd)                                │
│    0.0.0.0:3128 ──→ proxy.internal:8080 ──→ インターネット          │
│         ▲                                                         │
│         │ host.docker.internal:3128                               │
│  ┌──────┴────────────────────────────────┐                        │
│  │ Colima コンテナ                        │                        │
│  │  HTTP_PROXY=http://host.docker.       │                        │
│  │           internal:3128 (自動注入)    │                        │
│  └───────────────────────────────────────┘                        │
└───────────────────────────────────────────────────────────────────┘
```

3 層で構成する:

| 層 | 何をするか |
|---|---|
| ① TCP リレー (launchd) | Mac プロセスとして起動。コンテナからの接続を受け取り、上流プロキシへ中継 |
| ② Docker 自動注入 (`~/.docker/config.json`) | 全コンテナ起動時に proxy 環境変数を自動的に注入。個別設定不要 |
| ③ Node.js `instrumentation.ts` | undici の `EnvHttpProxyAgent` を global dispatcher に設定。fetch が proxy を使うようになる |

---

## セットアップ手順

### 前提

- macOS に Node.js が導入済み（Homebrew 等）
- 社内プロキシのアドレスとポートが分かっている（例: `proxy.internal:8080`）

### ① TCP リレーの作成

任意のディレクトリ（例: `~/docker-proxy-relay/`）に以下を配置する。

**`~/docker-proxy-relay/proxy-relay.js`**

```javascript
#!/usr/bin/env node
/**
 * docker-proxy-relay.js
 *
 * Colima コンテナから社内プロキシへのリレー。
 * Mac ホストプロセスとして 0.0.0.0:RELAY_PORT で待ち受け、
 * 上流プロキシ (UPSTREAM_HOST:UPSTREAM_PORT) にすべての TCP 接続を中継する。
 *
 * HTTP/HTTPS (CONNECT) どちらも透過的に扱う。
 */
const net = require('net');

const UPSTREAM_HOST = process.env.UPSTREAM_PROXY_HOST || 'proxy.internal';
const UPSTREAM_PORT = parseInt(process.env.UPSTREAM_PROXY_PORT || '8080', 10);
const LISTEN_PORT   = parseInt(process.env.RELAY_PORT || '3128', 10);

const server = net.createServer((client) => {
  const upstream = net.connect(UPSTREAM_PORT, UPSTREAM_HOST);

  upstream.on('connect', () => {
    client.pipe(upstream);
    upstream.pipe(client);
  });

  const destroy = () => { client.destroy(); upstream.destroy(); };
  upstream.on('error', destroy);
  client.on('error', destroy);
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  process.stdout.write(
    `[docker-proxy-relay] ${new Date().toISOString()} ` +
    `0.0.0.0:${LISTEN_PORT} → ${UPSTREAM_HOST}:${UPSTREAM_PORT}\n`
  );
});

server.on('error', (e) => {
  process.stderr.write(`[docker-proxy-relay] Fatal: ${e.message}\n`);
  process.exit(1);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT',  () => server.close(() => process.exit(0)));
```

### ② launchd サービス登録（Mac 再起動後も自動起動）

**`~/Library/LaunchAgents/your-domain.docker-proxy-relay.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>your-domain.docker-proxy-relay</string>

    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>/Users/YOUR_USER/docker-proxy-relay/proxy-relay.js</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/bin:/bin</string>
        <!-- 上流プロキシを変える場合はここで上書き -->
        <!-- <key>UPSTREAM_PROXY_HOST</key><string>proxy.internal</string> -->
        <!-- <key>UPSTREAM_PROXY_PORT</key><string>8080</string>           -->
        <!-- <key>RELAY_PORT</key><string>3128</string>                    -->
    </dict>

    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>

    <key>StandardOutPath</key>
    <string>/Users/YOUR_USER/docker-proxy-relay/relay.out.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USER/docker-proxy-relay/relay.err.log</string>

    <key>WorkingDirectory</key>
    <string>/Users/YOUR_USER/docker-proxy-relay</string>
</dict>
</plist>
```

ロード:

```bash
launchctl load ~/Library/LaunchAgents/your-domain.docker-proxy-relay.plist
# 確認
cat ~/docker-proxy-relay/relay.out.log
```

### ③ Docker 全コンテナへの自動注入

`~/.docker/config.json` を編集し、`proxies` セクションを追加する。
これにより **新規起動するすべてのコンテナ** に環境変数が自動注入される。

```json
{
  "proxies": {
    "default": {
      "httpProxy":  "http://host.docker.internal:3128",
      "httpsProxy": "http://host.docker.internal:3128",
      "noProxy":    "localhost,127.0.0.1,host.docker.internal"
    }
  }
}
```

> `noProxy` に `host.docker.internal` を含める理由: ローカル LLM サーバ等、
> ホストに直接繋ぐサービスへの通信がプロキシを経由しないようにするため。
> コンテナ間通信（サービス名解決）が必要な場合はそのサービス名も追記する。

設定後は既存コンテナを再起動すること（`docker compose up -d`）。

### ④ Node.js アプリの対応（Next.js 等）

Node.js の標準 `fetch`（undici ベース）は `HTTP_PROXY` を自動で読まないため、
プロジェクトルートに `instrumentation.ts` を追加して undici のグローバル設定を行う。

**前提**: `undici` を依存関係に追加する。

```bash
npm install undici
```

Next.js standalone ビルドを使う場合は、`undici` が standalone 出力に含まれないため
`Dockerfile` で明示的にコピーする:

```dockerfile
# runner ステージの末尾に追記
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/undici ./node_modules/undici
```

**`instrumentation.ts`**（プロジェクトルート）

```typescript
// Node.js 標準 fetch (undici) は HTTP_PROXY を自動では読まない。
// EnvHttpProxyAgent をグローバル dispatcher に設定する。
export async function register() {
  const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  if (!proxy) return;
  try {
    const { setGlobalDispatcher, EnvHttpProxyAgent } = await import('undici');
    setGlobalDispatcher(new EnvHttpProxyAgent());
  } catch {
    // undici が利用できない場合はスキップ
  }
}
```

> **Python アプリは追加作業不要。** `requests` / `httpx` 等は
> `http_proxy` 環境変数を自動で読む。③の Docker 設定で完結する。

---

## 動作確認

```bash
# 1. リレーが起動しているか
cat ~/docker-proxy-relay/relay.out.log

# 2. コンテナに proxy 環境変数が注入されているか
docker exec <container> env | grep -i proxy

# 3. コンテナから外部へ疎通確認（curl がある場合）
docker exec <container> curl -s --max-time 10 https://example.com | head -5
```

---

## トラブルシュート

| 症状 | 確認ポイント |
|---|---|
| `fetch failed` / タイムアウト | リレーが起動しているか (`launchctl list \| grep proxy-relay`) |
| コンテナに HTTP_PROXY が入っていない | `~/.docker/config.json` の `proxies` セクションを確認。コンテナ再起動が必要 |
| リレーが起動しない | ポート 3128 が使われていないか確認 (`lsof -i :3128`) |
| Node.js fetch が proxy を使わない | `instrumentation.ts` が追加されているか、`undici` が node_modules にあるか確認 |
| 特定のホストにだけ繋がらない | `NO_PROXY` にそのホスト名を追記する |

---

## 言語・フレームワーク別まとめ

| 言語 / FW | 追加作業 | 備考 |
|---|---|---|
| Python (`requests`, `httpx`) | **不要** | `http_proxy` を自動で読む |
| Node.js (`fetch`) | `instrumentation.ts` + `undici` | 自動読取しないため明示設定が必要 |
| Node.js (`axios`, `node-fetch`) | 基本不要 | `HTTP_PROXY` を読む実装が多い |
| Go | 基本不要 | `net/http` は `HTTP_PROXY` を自動で読む |
