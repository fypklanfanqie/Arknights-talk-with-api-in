#!/usr/bin/env bash
# ============================================================
# 部署脚本：将静态站点部署到 Cloudflare Pages (arknights-talk-with-api-in)
# 用法（在 Git Bash / WSL 中执行）：
#   bash deploy-pages.sh
#
# 说明：
#   - wrangler 4.x 的 `pages deploy` 不会读取 .assetsignore，
#     而是使用硬编码的忽略列表，因此这里先组装一个干净暂存目录 .deploy/
#     （只包含运行时需要的文件），再从暂存目录部署。
#   - .deploy/ 已加入 .gitignore，不会污染仓库。
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

PROJECT="arknights-talk-with-api-in"
BRANCH="main"

# 运行时需要的目录
ASSETS=(index.html css fonts js lib live2d music picture prompts)

echo "==> 组装暂存目录 .deploy/"
rm -rf .deploy
mkdir -p .deploy

for item in "${ASSETS[@]}"; do
  if [ -e "$item" ]; then
    cp -r "$item" .deploy/
  else
    echo "!! 警告: 缺少 $item，已跳过"
  fi
done

echo "==> 部署到 Cloudflare Pages (${PROJECT})"
wrangler pages deploy .deploy --project-name "$PROJECT" --branch "$BRANCH" --commit-dirty=true

echo "==> 完成"
echo "生产域名: https://arknights-talk-with-api-in.fypklanfanqie.xyz"
echo "Pages 地址: https://${PROJECT}.pages.dev"
