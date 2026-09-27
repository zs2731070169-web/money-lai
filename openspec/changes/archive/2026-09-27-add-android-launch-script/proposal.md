# 提案：安卓真机一键部署脚本

## Why

安卓真机实测已成为常规验证回路（抽屉/连抽/皮肤分组均以真机走查收尾），但目前部署靠手工串命令（vite build → cap sync → gradlew installDebug → force-stop + am start），易漏步且与 iOS 侧 `launch-simulator.sh` 不对称。

## What Changes

- 新增 `scripts/launch-android.sh`：查设备 → **清空应用数据** → 构建 Web 产物 → cap sync → gradlew 安装 → 冷启。实测反馈追加：每次部署都先清数据（走查常需全新进度）；`pm clear` 失败的机型（实测华为/荣耀会连带移除调试包）自动降级为卸载重装兜底。
- `--fast` 跳过构建编译仅清数据并重启；若应用已被清数据步骤移除则报错退出并提示走全量。
- `package.json` 增加 `launch:android` / `launch:android:fast` 脚本入口。
- 多设备时以 `ANDROID_SERIAL` 指定目标；无已授权设备时明确报错退出。

## Capabilities

### New Capabilities
（无——开发工具链脚本，无产品行为变化，`skip_specs: true`）

### Modified Capabilities
（无）

## Impact

- 代码：`scripts/launch-android.sh`（新增）、`package.json`（scripts 两项）。
- 验证：`bash -n` 语法检查 + 真机端到端跑通一次。
