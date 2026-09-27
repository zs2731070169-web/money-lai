## Why

项目已有产品规格和测试，但缺少仓库级 Agent 入口与统一验证命令。不同编码工具难以稳定找到相同的架构约束、规格来源和验收方式。

## What Changes

- 完成 OpenSpec 的 Codex、Claude Code 和共享 Agents 集成。
- 新增仓库级 `AGENTS.md` 与精简的 Harness 规则、工作流和经验记录。
- 新增统一的 `npm run verify` 验证入口，并为 OpenSpec 规格提供单独校验命令。
- 将项目技术背景写入 OpenSpec 配置，供后续变更产物生成时使用。

## Capabilities

### New Capabilities

无。此次仅初始化开发工具与文档，不改变游戏行为，因此设置 `skip_specs: true`。

### Modified Capabilities

无。

## Impact

影响仓库内的代理说明、OpenSpec 配置和 npm 脚本；无运行时依赖或产品 API 变化。
