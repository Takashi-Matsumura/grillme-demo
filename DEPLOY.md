# 社内デプロイ手順（Docker / Colima）

grillme-demo を社内環境へデプロイするための手順。本番ランタイムは **Colima**
（macOS 上の Docker 互換コンテナランタイム）を想定する。

## アーキテクチャ

```
┌────────────────────────── ホスト (macOS + Colima) ──────────────────────────┐
│                                                                            │
│   llama-server (gemma-4-12b, Metal GPU)        ← LLM はホストに残す         │
│        :8080  --host 0.0.0.0                                               │
│          ▲                                                                 │
│          │ host.docker.internal:8080                                       │
│   ┌──────┴───────────────────────────────┐                                │
│   │ コンテナ: grillme-demo (Next.js)      │                                │
│   │   :3000  (server.js / standalone)     │                                │
│   │   /data/analyses  ← named volume      │  ← 業務データを永続化           │
│   └───────────────────────────────────────┘                                │
└────────────────────────────────────────────────────────────────────────────┘
```

**なぜ LLM をコンテナに入れないか:** `gemma-4-12b` は Mac の Metal GPU で動く
llama.cpp サーバ。Colima の Linux VM には GPU が渡らず、コンテナ内 CPU 実行では
実用速度が出ない。そのため LLM はホストに残し、アプリだけをコンテナ化する。

## 前提

- Colima と Docker CLI がインストール済み（`brew install colima docker`）
- ホストで llama-server が **全インタフェース**で待ち受けていること:

  ```bash
  llama-server -m /path/to/gemma-4-12b-it-Q4_K_M.gguf --host 0.0.0.0 --port 8080
  ```

  `--host 0.0.0.0` が重要。`127.0.0.1` だと Colima VM からコンテナが届かない。

> **社内プロキシ環境の場合:** インターネットアクセスが HTTP プロキシ必須の
> 環境では、コンテナから e-Gov API 等へ繋ぐために追加設定が必要です。
> 先に [`docs/corporate-proxy-setup.md`](./docs/corporate-proxy-setup.md) を参照してください。

## 手順

```bash
# 1. ランタイム起動（未起動なら）
colima start

# 2. 環境変数を用意（必要なら値を編集）
cp .env.example .env

# 3. ビルド & 起動
docker compose up -d --build

# 4. ログ確認
docker compose logs -f app
```

ブラウザで `http://localhost:3000`（`APP_PORT` を変えた場合はそのポート）。

## 動作確認

```bash
# コンテナの稼働状態（healthcheck が healthy になるか）
docker compose ps

# コンテナ → ホスト LLM の疎通確認
docker compose exec app wget -qO- http://host.docker.internal:8080/v1/models
```

## 運用

| やりたいこと           | コマンド                                  |
| ---------------------- | ----------------------------------------- |
| 停止                   | `docker compose down`                     |
| 再起動                 | `docker compose restart app`              |
| 更新（再ビルド）       | `docker compose up -d --build`            |
| ログ                   | `docker compose logs -f app`              |
| データ確認             | `docker volume inspect grillme-demo_analyses` |

## データの永続化とバックアップ

業務データ（`analyses/`）は named volume `analyses` に保存され、コンテナを
作り直しても残る。バックアップ例:

```bash
# volume を tar に書き出す
docker run --rm -v grillme-demo_analyses:/data -v "$PWD":/backup alpine \
  tar czf /backup/analyses-backup.tar.gz -C /data .

# 復元
docker run --rm -v grillme-demo_analyses:/data -v "$PWD":/backup alpine \
  sh -c "cd /data && tar xzf /backup/analyses-backup.tar.gz"
```

> volume 名は `<プロジェクトディレクトリ名>_analyses`。ディレクトリが
> `grillme-demo` なら `grillme-demo_analyses`。`docker volume ls` で確認できる。

## 環境変数

| 変数                    | 既定値                              | 用途                                  |
| ----------------------- | ----------------------------------- | ------------------------------------- |
| `APP_PORT`              | `3000`                              | ホスト側公開ポート                    |
| `LLAMA_BASE_URL`        | `http://host.docker.internal:8080`  | LLM(llama-server) のベース URL        |
| `LLAMA_MODEL`           | `gemma`                             | モデル名                              |
| `LLAMA_IDLE_TIMEOUT_MS` | `120000`                            | LLM 無音タイムアウト(ms)              |

## トラブルシュート

- **LLM に繋がらない / リサーチが即エラー**
  - ホストの llama-server が `--host 0.0.0.0` で起動しているか確認
  - `docker compose exec app wget -qO- http://host.docker.internal:8080/v1/models` で疎通確認
  - LLM を別マシンで動かす場合は `.env` の `LLAMA_BASE_URL` をそのアドレスに変更
- **法令リサーチが `fetch failed` で止まる（社内プロキシ環境）**
  - インターネットアクセスが HTTP プロキシ必須の環境では、コンテナから
    e-Gov API 等への接続に追加設定が必要。手順は
    [`docs/corporate-proxy-setup.md`](./docs/corporate-proxy-setup.md) を参照
- **データが消えた**
  - `docker compose down -v` は volume も削除する。データを残すなら `-v` を付けない
