# 社内プロキシ対応の構造解説

社内プロキシ環境（Issue #29）で「法令・実務リサーチ」がコンテナから外部 API に
繋がらなかった問題を、どんな部品でどう解決しているかを図解する**解説ドキュメント**。

> 実際のセットアップ手順（コード・設定の現物）は
> [`corporate-proxy-setup.md`](./corporate-proxy-setup.md) を参照。
> 本書はその「なぜこの構造なのか」を理解するための補足。

## 全体像：なぜ2つの対策が必要だったか

コンテナが外部（e-Gov API 等）に繋がらない原因は、**性質の違う2つの問題が
重なっていた**こと。それぞれ別の層で解く必要があった。

| #   | 問題                                                                                                              | 層             |
| --- | --------------------------------------------------------------------------------------------------------------- | -------------- |
| 問題A | **Colima の VM ネットワークから社内プロキシへ TCP が通らない**。Mac ホストからは届くが、コンテナが乗る別ネットワークからは届かない | ネットワーク層 |
| 問題B | **Node.js 標準の `fetch`（undici）は `HTTP_PROXY` を自動で読まない**。Python / Go は自動で読むが Node だけ明示設定が要る  | アプリ層       |

これを **3つの部品** で解いている。

## 使っている部品（3層構成）

| 層            | 部品                                  | 使っている技術                                                | 役割                                                                                                                       |
| ------------- | ------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| ① TCP リレー  | `~/docker-proxy-relay/proxy-relay.js` | Node.js の `net` モジュール（生 TCP 中継）＋ **launchd** で常駐 | ホスト上で `0.0.0.0:3128` を待ち受け、コンテナからの接続を社内プロキシ `proxy.internal:8080` へそのまま中継。**問題Aを解決** |
| ② Docker 自動注入 | `~/.docker/config.json` の `proxies` | Docker CLI のプロキシ設定機能                                  | 起動する**全コンテナ**に `HTTP_PROXY=http://host.docker.internal:3128` を自動注入。コンテナ個別の設定が不要に                |
| ③ Node.js 対応 | `instrumentation.ts` ＋ `undici`      | Next.js の instrumentation hook ＋ undici の `EnvHttpProxyAgent` | サーバ起動時に1回、undici のグローバル dispatcher をプロキシ対応版に差し替え。`fetch` が `HTTP_PROXY` を見るように。**問題Bを解決** |

ポイントは **「コンテナ → `host.docker.internal:3128`（ホスト上のリレー）→ 社内プロキシ
→ インターネット」** という経路を作っていること。コンテナは社内プロキシを直接知らず、
いつもホスト上のリレーに話しかけるだけで済む。

## 構成図

```mermaid
flowchart LR
    subgraph corp["社内ネットワーク"]
        proxy["社内プロキシ<br/>proxy.internal:8080"]
        net["インターネット<br/>e-Gov API 等"]
    end

    subgraph host["macOS ホスト (Colima 稼働)"]
        relay["① proxy-relay.js<br/>Node net / launchd 常駐<br/>0.0.0.0:3128 で待受"]
        llm["llama-server<br/>:8080 (Metal GPU)"]
    end

    subgraph container["Colima コンテナ: grillme-demo (Next.js)"]
        instr["③ instrumentation.ts<br/>undici EnvHttpProxyAgent<br/>= global dispatcher"]
        app["Next.js / fetch<br/>egov.ts・fetch-page.ts"]
        envv["② HTTP_PROXY=<br/>host.docker.internal:3128<br/>(Docker が自動注入)"]
    end

    app -->|"③ fetch が proxy を使う"| instr
    instr -->|"② 注入された host.docker.internal:3128 へ"| relay
    relay -->|"① TCP 中継"| proxy
    proxy --> net

    app -.->|"LLM はプロキシ非経由<br/>(NO_PROXY)"| llm
```

## リクエストの流れ

```mermaid
sequenceDiagram
    participant App as Next.js fetch<br/>(コンテナ内)
    participant Undici as undici dispatcher<br/>instrumentation.ts ③
    participant Relay as proxy-relay.js<br/>ホスト :3128 ①
    participant Proxy as 社内プロキシ<br/>proxy.internal:8080
    participant Net as e-Gov API

    App->>Undici: fetch("https://laws.e-gov.go.jp/...")
    Note over Undici: HTTP_PROXY を読み<br/>proxy 経由に切替
    Undici->>Relay: host.docker.internal:3128 へ接続<br/>(② Docker が注入した値)
    Relay->>Proxy: TCP をそのまま中継 ①
    Proxy->>Net: 実リクエスト
    Net-->>Proxy: レスポンス
    Proxy-->>Relay: 応答を中継
    Relay-->>Undici: 応答を中継
    Undici-->>App: レスポンス
```

## 補足（理解の助けに）

- **なぜ LLM だけプロキシを通さないか**: `~/.docker/config.json` の `noProxy` に
  `host.docker.internal` を入れているため、ホスト上の llama-server（`:8080`）への
  通信はプロキシを経由せず直接届く。外部 API だけプロキシ、内部 LLM は直結、と
  使い分けている。
- **リポジトリに入っているのは③だけ**: `instrumentation.ts` / `undici` 依存 /
  Dockerfile の undici コピーはコード側なのでリポジトリ管理。①②（リレー本体・
  launchd・docker config）は**そのホスト固有のインフラ設定**なので、コードでは
  なく [`corporate-proxy-setup.md`](./corporate-proxy-setup.md) に手順として残す方針。
- **Dockerfile で undici を明示コピーしている理由**: `instrumentation.ts` が
  `await import('undici')` と**動的 import** するため、Next の standalone ビルドの
  依存トレースに undici が含まれず、手動コピーで補っている。

この3層がそろって初めて「コンテナ内の `fetch` が社内プロキシ越しに e-Gov へ届く」
状態になる。
