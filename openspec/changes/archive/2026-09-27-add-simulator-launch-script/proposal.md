# 提案：模拟器一键启动脚本（开发工具）

## Why

每轮调参后手动执行「构建→同步→杀旧进程→安装→启动」五步串行命令，繁琐易错；旧进程不杀会出现新包未生效的假象。

## What Changes

新增 `scripts/launch-simulator.sh` + `npm run launch`：杀掉旧 App 进程 → 全量构建（可 --fast 跳过）→ 安装最新包 → 启动。

## Capabilities

### New Capabilities
（无——纯开发工具，`skip_specs: true`。）

### Modified Capabilities
（无。）

## Impact

- 新文件 scripts/launch-simulator.sh；package.json 增 launch 脚本。不影响产品行为。
