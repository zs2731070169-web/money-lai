# money-lai Agent 指南

本项目用 OpenSpec 管理产品行为，用仓库内的 Harness 规则约束实现和验证。默认中文沟通。开始工作时先看 `git status --short`，保留其他人或其他会话的改动。

## 从哪里读起

- 产品行为：`openspec/specs/`；正在实施的差异：`openspec/changes/`。
- 架构和编码边界：`.harness/rules.md`；已确认的项目约定：`knowledge/conventions.md`。
- 变更步骤与验证方式：`docs/workflows.md`；历史失误：`knowledge/ai-error-log.md`。
- 真机视觉验收：`docs/device-qa-checklist.md`。Claude Code 的详细说明另见 `CLAUDE.md`。

## 工作约束

- 产品行为改变、缺陷修复或参数调优，先建立或更新对应 OpenSpec 变更，校验通过后修改代码；完成时同步主规格并归档。纯工具和文档变更可在变更中设置 `skip_specs: true`。
- 只改当前任务涉及的文件。不要回滚、重排或提交他人改动；工作区已有多个并行变更时先辨认归属。
- `src/core/` 不直接调用浏览器、Capacitor 或其他平台 API，统一经 `src/core/platform.ts`。渲染或交互修复须检查相关纯函数、集成测试及实际画面。
- 完成前运行 `npm run verify`；修改规格时另运行 `npm run verify:specs` 和当前变更的严格校验。视觉问题还需按真机清单检查，自动测试通过不等于视觉验收通过。
