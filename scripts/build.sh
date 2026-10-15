#!/usr/bin/env bash
set -euo pipefail

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
dist_root="$project_root/dist"

rm -rf "$dist_root"
mkdir -p "$dist_root/server" "$dist_root/.openai"
cp "$project_root/worker/app-navigation.js" "$dist_root/server/app-navigation.js"
cp "$project_root/worker/index.js" "$dist_root/server/index.js"
cp "$project_root/worker/document-font-assets.js" "$dist_root/server/document-font-assets.js"
cp "$project_root/worker/document-assets.js" "$dist_root/server/document-assets.js"
cp "$project_root/worker/production-assets.js" "$dist_root/server/production-assets.js"
cp "$project_root/worker/ui-assets.js" "$dist_root/server/ui-assets.js"
cp "$project_root/worker/account-assets.js" "$dist_root/server/account-assets.js"
cp "$project_root/worker/youtube-meta.js" "$dist_root/server/youtube-meta.js"
cp "$project_root/worker/auth.js" "$dist_root/server/auth.js"
cp "$project_root/worker/nas-storage.js" "$dist_root/server/nas-storage.js"
cp "$project_root/.openai/hosting.json" "$dist_root/.openai/hosting.json"

echo "Built $dist_root"
