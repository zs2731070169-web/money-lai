#!/usr/bin/env bash
# 模拟器一键启动脚本（任务：add-simulator-launch-script）
# 流程：杀旧进程 → 构建（--fast 可跳过）→ 同步 → 安装 → 启动
# 用法：
#   npm run launch           # 全量构建后启动
#   npm run launch -- --fast # 跳过构建，用最近一次构建产物启动
# 环境变量：SIM=模拟器名（默认 "iPhone 17"）

set -euo pipefail

SIMULATOR_NAME="${SIM:-iPhone 17}"
APP_ID="com.hariku.moneylai"
APP_PATH="ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app"

cd "$(dirname "$0")/.."

echo "▸ 1/5 终止旧进程（${SIMULATOR_NAME} / ${APP_ID}）"
xcrun simctl terminate "$SIMULATOR_NAME" "$APP_ID" 2>/dev/null || true

if [[ "${1:-}" != "--fast" ]]; then
  echo "▸ 2/5 构建 Web 产物"
  npm run build

  echo "▸ 3/5 同步并编译 iOS"
  npx cap sync ios
  xcodebuild -project ios/App/App.xcodeproj -scheme App \
    -destination "platform=iOS Simulator,name=${SIMULATOR_NAME}" \
    -derivedDataPath ios/DerivedData build \
    | grep -E "error|BUILD" || true
  # xcodebuild 输出经 grep 过滤后无法感知失败，单独校验产物目录
  [[ -d "$APP_PATH" ]] || { echo "✖ 构建产物缺失：$APP_PATH"; exit 1; }
else
  echo "▸ 2/5 跳过构建（--fast）"
  echo "▸ 3/5 跳过编译（--fast）"
  [[ -d "$APP_PATH" ]] || { echo "✖ 无历史构建产物，请去掉 --fast 先完整构建一次"; exit 1; }
fi

echo "▸ 4/5 安装到模拟器"
xcrun simctl install "$SIMULATOR_NAME" "$APP_PATH"

echo "▸ 5/5 启动"
xcrun simctl launch "$SIMULATOR_NAME" "$APP_ID"

echo "✔ 启动完成（$(date +%H:%M:%S)）"
