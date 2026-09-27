#!/usr/bin/env bash
# 安卓真机一键部署脚本（任务：add-android-launch-script；实测反馈：每次部署先清空数据）
# 流程：查设备 → 清空应用数据 → 构建（--fast 可跳过）→ 同步 → 编译安装 → 冷启
# 用法：
#   npm run launch:android           # 全量构建 + 清数据 + 部署
#   npm run launch:android -- --fast # 只清数据并重启现有应用（应用被清除时退出并提示走全量）
# 环境变量：ANDROID_SERIAL=设备序列号（多台设备时指定；默认 adb 第一台）

set -euo pipefail

APP_ID="com.hariku.moneylai"
APP_ACTIVITY="${APP_ID}/.MainActivity"
SERIAL="${ANDROID_SERIAL:-}"

cd "$(dirname "$0")/.."

# adb 目标设备参数：空串=默认设备；非空="-s 序列号"。
# 用字符串而非数组：macOS 自带 bash 3.2 在 set -u 下展开空数组会误报 unbound variable
adb_target_args=""
if [[ -n "$SERIAL" ]]; then
  adb_target_args="-s ${SERIAL}"
fi

echo "▸ 1/5 检查设备连接"
# shellcheck disable=SC2086
if ! adb ${adb_target_args} get-state >/dev/null 2>&1; then
  echo "✖ 未检测到已授权的安卓设备（adb get-state 失败）"
  echo "  请连接手机、开启 USB 调试并允许调试授权后重试"
  exit 1
fi
echo "  目标设备：${SERIAL:-adb 默认设备}"

echo "▸ 2/5 清空应用数据（每次部署都从全新进度开始）"
# shellcheck disable=SC2086
if adb ${adb_target_args} shell pm clear "$APP_ID" >/dev/null 2>&1; then
  echo "  pm clear 成功"
else
  # 部分机型（实测华为/荣耀）对调试包 pm clear 会失败并移除应用：卸载兜底，随后的安装即全新数据
  echo "  pm clear 失败（机型限制），改为卸载重装兜底"
  # shellcheck disable=SC2086
  adb ${adb_target_args} uninstall "$APP_ID" >/dev/null 2>&1 || true
fi

if [[ "${1:-}" != "--fast" ]]; then
  echo "▸ 3/5 构建 Web 产物（tsc 类型检查 + vite 构建）"
  npm run build

  echo "▸ 4/5 同步 Capacitor 并编译安装 APK"
  npx cap sync android
  (cd android && ./gradlew installDebug)
else
  echo "▸ 3/5 跳过构建（--fast）"
  echo "▸ 4/5 跳过编译（--fast）"
  # 清数据可能已移除应用：fast 模式不安装，先确认应用仍在
  # shellcheck disable=SC2086
  if ! adb ${adb_target_args} shell pm path "$APP_ID" >/dev/null 2>&1; then
    echo "✖ 应用已被清数据步骤移除，--fast 无法启动；请去掉 --fast 走全量部署"
    exit 1
  fi
fi

echo "▸ 5/5 冷启应用"
# shellcheck disable=SC2086
adb ${adb_target_args} shell am start -n "$APP_ACTIVITY"

echo "✔ 安卓部署完成（数据已清空，全新进度）"
