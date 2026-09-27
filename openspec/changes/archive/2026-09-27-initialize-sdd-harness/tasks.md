## 1. SDD 工具接入

- [x] 1.1 用 `openspec init` 为 Codex、Claude Code 和共享 Agents 生成适配文件，核对 `.agents/skills/` 与 `.claude/` 文件存在。
- [x] 1.2 在 `openspec/config.yaml` 写入稳定项目背景，运行 `openspec validate --specs --strict --no-interactive` 验证既有主规格。

## 2. Harness 约束与知识

- [x] 2.1 新增 `AGENTS.md` 与 `.harness/rules.md`，人工核对其中路径、架构约束和现有项目一致。
- [x] 2.2 新增 `docs/workflows.md` 与 `knowledge/` 约定、错误日志，核对能从 `AGENTS.md` 定位这些文件。

## 3. 验证入口

- [ ] 3.1 新增 `npm run verify` 和 `npm run verify:specs`，运行两条命令并确认退出码为 0。
- [x] 3.2 执行 `openspec validate initialize-sdd-harness --strict --no-interactive` 与 `git diff --check`，检查配置和文档无误。
