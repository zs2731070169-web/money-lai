#!/usr/bin/env bash
# iOS 打包脚本（add-release-package-scripts）：出可安装的 development IPA
# 流程：前置签名检查 → 构建 Web → cap sync → xcodebuild archive → 导出 IPA → packages/
# 前置要求（缺一即停在 1/6 并给指引）：
#   1. 本机有有效 Apple 开发签名证书（security find-identity 可见）
#   2. Xcode 项目已配置开发团队（DEVELOPMENT_TEAM），或本机 Xcode 已登录可自动签名的账号
# 用法：npm run package:ios

set -euo pipefail

OUTPUT_DIR="packages"
ARCHIVE_PATH="build/ios/App.xcarchive"

cd "$(dirname "$0")/.."

echo "▸ 1/6 前置检查：开发签名证书"
# 注意：无证书时汇总行「0 valid identities found」也含关键词，须提取数字判断而非计数行数
VALID_IDENTITIES=$(security find-identity -v -p codesigning 2>/dev/null | grep -oE "[0-9]+ valid identities found" | grep -oE "^[0-9]+" | head -1)
VALID_IDENTITIES=${VALID_IDENTITIES:-0}
if [[ "$VALID_IDENTITIES" -eq 0 ]]; then
  echo "✖ 本机没有有效的 Apple 开发签名证书，无法导出可安装的 IPA"
  echo "  三条路任选："
  echo "  1) Xcode → Settings → Accounts 登录 Apple 开发者账号，选 Team 后重跑（自动签名）"
  echo "  2) Apple Developer 后台手动生成 Development 证书并安装到钥匙串，"
  echo "     然后在 ios/App.xcodeproj 设置 DEVELOPMENT_TEAM"
  echo "  3) 仅模拟器验证则无需本脚本：npm run launch 已覆盖"
  exit 1
fi
echo "  检测到 ${VALID_IDENTITIES} 张有效证书，继续"

echo "▸ 2/6 构建 Web 产物（tsc + vite）"
npm run build

echo "▸ 3/6 同步 Capacitor"
npx cap sync ios

echo "▸ 4/6 xcodebuild archive（通用 iOS 设备）"
mkdir -p build/ios
xcodebuild archive \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  | tail -5

echo "▸ 5/6 导出 development IPA"
mkdir -p "$OUTPUT_DIR" build/ios
cat > build/ios/ExportOptions.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>development</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</string>
  <true/>
</dict>
</plist>
PLIST
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist build/ios/ExportOptions.plist \
  -exportPath "$OUTPUT_DIR" \
  | tail -3

echo "▸ 6/6 归档产物"
STAMP=$(date +%Y%m%d-%H%M)
FINAL_IPA="$OUTPUT_DIR/money-lai-${STAMP}.ipa"
mv "$OUTPUT_DIR/App.ipa" "$FINAL_IPA" 2>/dev/null || FINAL_IPA=$(ls -t "$OUTPUT_DIR"/*.ipa | head -1)

echo "✔ iOS 打包完成：$FINAL_IPA"
echo "  安装：Apple Configator / Finder 拖装 / xcrun devicectl device install app"
