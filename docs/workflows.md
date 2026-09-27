# SDD + Harness 工作流

1. **定位**：运行 `git status --short`，阅读与任务相关的 `openspec/specs/`、源码、测试和 `knowledge/`。先区分已有改动与本次改动。
2. **定义**：为产品行为变化建立 OpenSpec 变更：`openspec new change <name>`，按 CLI 给出的顺序填写 proposal、specs、design、tasks；纯工具或文档变更在 `.openspec.yaml` 设置 `skip_specs: true`。用 `openspec validate <name> --strict --no-interactive` 校验。
3. **实施**：按任务清单做最小修改；相关测试先覆盖失败场景，再修复代码并复测。完成一项就勾选一项。
4. **验收**：运行 `npm run verify`。主规格变化时运行 `npm run verify:specs`。视觉与声音还要在适用设备上按 `docs/device-qa-checklist.md` 走查，记录尚未验证的项目。
5. **沉淀**：把确认过的共性规则写入 `knowledge/conventions.md`，把可复现的失误和避免方法写入 `knowledge/ai-error-log.md`；完成并同步主规格后归档 OpenSpec 变更。

常用命令：`npm test -- <test-file>` 跑聚焦测试；`npm run verify` 跑代码门；`npm run verify:specs` 校验主规格；`openspec list --json` 查看当前变更。
