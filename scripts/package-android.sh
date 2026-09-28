#!/usr/bin/env bash
# 安卓打包脚本（add-release-package-scripts）：出可安装的 release APK
# 流程：构建 Web → cap sync → assembleRelease → zipalign → debug 密钥签名 → 校验 → packages/
# 签名说明：用 ~/.android/debug.keystore 签名——真机侧载安装用；
#           上架应用商店需自建正式 keystore 并改 gradle signingConfig。
# 用法：npm run package:android

set -euo pipefail

APP_ID="com.hariku.letterburning"
OUTPUT_DIR="packages"
KEYSTORE_PATH="${HOME}/.android/debug.keystore"

cd "$(dirname "$0")/.."

echo "▸ 1/6 构建 Web 产物（tsc + vite）"
npm run build

echo "▸ 2/6 同步 Capacitor"
bash scripts/sync-native-branding.sh
npx cap sync android

echo "▸ 3/6 编译 release APK"
(cd android && ./gradlew assembleRelease)

# 产物定位：无 release signingConfig 时为 unsigned；配置后为已签名 apk
UNSIGNED_APK="android/app/build/outputs/apk/release/app-release-unsigned.apk"
SIGNED_APK="android/app/build/outputs/apk/release/app-release.apk"
if [[ -f "$SIGNED_APK" ]]; then
  echo "▸ 4/6 检测到 gradle 已签名产物（项目配置了 release 签名），跳过脚本签名"
  STAGE_APK="$SIGNED_APK"
else
  if [[ ! -f "$UNSIGNED_APK" ]]; then
    echo "✖ 未找到 release 产物（$UNSIGNED_APK）"; exit 1
  fi
  if [[ ! -f "$KEYSTORE_PATH" ]]; then
    echo "✖ 缺少 debug 密钥库 $KEYSTORE_PATH（先连一次 Android Studio/adb 生成，或自建正式密钥）"; exit 1
  fi
  echo "▸ 4/6 zipalign + debug 密钥签名"
  BUILD_TOOLS_DIR=$(ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | sort -V | tail -1)
  if [[ -z "$BUILD_TOOLS_DIR" ]]; then
    echo "✖ 未找到 Android build-tools（ANDROID_HOME=$ANDROID_HOME）"; exit 1
  fi
  mkdir -p "$OUTPUT_DIR"
  STAGE_APK="$OUTPUT_DIR/.staging-aligned.apk"
  "$BUILD_TOOLS_DIR/zipalign" -f 4 "$UNSIGNED_APK" "$STAGE_APK"
  "$BUILD_TOOLS_DIR/apksigner" sign \
    --ks "$KEYSTORE_PATH" --ks-pass pass:android --ks-key-alias androiddebugkey \
    --key-pass pass:android "$STAGE_APK"
fi

echo "▸ 5/6 校验签名"
"$BUILD_TOOLS_DIR/apksigner" verify "$STAGE_APK" && echo "  签名校验通过"

echo "▸ 6/6 归档产物"
mkdir -p "$OUTPUT_DIR"
VERSION_NAME=$(grep -o 'versionName "[^"]*"' android/app/build.gradle | head -1 | cut -d'"' -f2)
STAMP=$(date +%Y%m%d-%H%M)
FINAL_APK="$OUTPUT_DIR/letter-burning-v${VERSION_NAME}-${STAMP}.apk"
mv "$STAGE_APK" "$FINAL_APK"
rm -f "$STAGE_APK.idsig"  # apksigner 签名边车文件不随产物分发

echo "✔ 安卓打包完成：$FINAL_APK"
echo "  安装：adb install -r \"$FINAL_APK\"（debug 签名，真机侧载用；上架需正式签名）"
