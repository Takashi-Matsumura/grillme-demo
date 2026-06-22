# syntax=docker/dockerfile:1
#
# grillme-demo (Next.js 16) 本番イメージ。
# Next.js の output:"standalone" を使い、3 ステージで最小ランタイムを作る。
#   deps    : 依存インストール（lockfile ベース）
#   builder : next build → .next/standalone を生成
#   runner  : standalone 出力 + static + public だけを載せた最終イメージ
#
# 注意: LLM(llama-server) はこのイメージに含めない。Mac/Colima ホスト側で
#       Metal GPU で動かし、コンテナからは host.docker.internal:8080 で呼ぶ
#       （docker-compose.yml の extra_hosts / LLAMA_BASE_URL を参照）。

# Node 24 LTS。Next 16 のネイティブ依存トレース向けに libc6-compat を入れる。
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat

# ---- deps: 依存だけを別レイヤでキャッシュ ----
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# ---- builder: アプリをビルド ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# テレメトリ無効化（本番イメージビルドの外部通信を避ける）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: 最終ランタイム ----
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# standalone の server.js を外部公開アドレスで待ち受ける
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# 永続データ（analyses）の保存先。compose で同パスに volume をマウントする。
ENV OPS_GRILL_ANALYSES_DIR=/data/analyses

# 非 root 実行ユーザ
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# standalone 出力（最小 node_modules + server.js を含む）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# 静的アセットと public は standalone に含まれないので手動コピー
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# instrumentation.ts が動的 import する undici は standalone トレースに含まれないため明示コピー
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/undici ./node_modules/undici

# 永続データ用ディレクトリを用意し、volume 初期化時の所有者を nextjs にする
RUN mkdir -p /data/analyses && chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 3000

# next build が出力する最小サーバを起動（next start ではない）
CMD ["node", "server.js"]
