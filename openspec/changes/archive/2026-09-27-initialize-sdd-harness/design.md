## Context

现有 `openspec/specs/` 已覆盖六项产品能力，`package.json` 分散提供测试、构建和导入审计命令。仓库还没有根目录 `AGENTS.md`。初始化必须保留当前并行进行的音频变更和已有规格。

## Goals / Non-Goals

**Goals:** 让 Codex、Claude Code 和共享 Agents 使用同一组产品规格、架构边界和本地验证命令；让新任务能从根目录找到最小必要上下文。

**Non-Goals:** 不引入额外运行时框架、云服务、自动提交或部署逻辑；不改游戏行为。

## Decisions

- 继续以 OpenSpec 为需求真源，调用官方 `openspec init` 补齐工具适配，避免复制自定义技能模板。
- 根目录 `AGENTS.md` 负责短导航和硬边界；`.harness/` 记录具体执行规则；`knowledge/` 记录已经验证的约定与缺陷经验。信息按需引用，避免每次加载整套文档。
- `npm run verify` 串行运行导入边界审计、全量 Vitest 和 TypeScript/Vite 构建。OpenSpec 校验单独提供 `verify:specs`，避免其他未完成的并行变更阻塞代码验证。
- OpenSpec 的 `context` 只写稳定的项目技术和架构事实，不复制整份 Agent 规则。

## Risks / Trade-offs

- 规则散布造成矛盾 → `AGENTS.md` 作为导航，具体产品要求始终以 `openspec/specs/` 为准。
- 全量测试含音频离线渲染，可能较慢 → 保留聚焦测试命令供开发迭代，完成前统一跑 `verify`。
- OpenSpec 校验依赖本机 CLI → 产品构建不依赖它；规格校验由 `verify:specs` 独立执行。

## Migration Plan

仅新增或更新仓库文件；不需数据迁移。若撤销初始化，移除新文档和脚本即可，现有规格与应用仍可使用。
