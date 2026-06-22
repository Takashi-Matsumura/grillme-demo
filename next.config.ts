import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 向けに最小構成の self-contained サーバ（.next/standalone）を出力する。
  // これにより本番イメージに node_modules 全体を含めずに済む。
  output: "standalone",
};

export default nextConfig;
