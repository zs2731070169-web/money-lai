## 1. 信纸角饰

- [x] 1.1 调浅 `letter_paper.png` 左上和右下铃兰及相邻叶片；检查 1024×1536 RGBA、透明边缘和纸纹未受损，并目视确认角饰仍可辨认。
- [ ] 1.2 在实际书写画面检查角饰与正文的对比度，按 `docs/device-qa-checklist.md` 记录可完成的模拟器验收及剩余真机项目。

## 2. 验证与收尾

- [ ] 2.1 运行 `npm run verify`、`npm run verify:specs`、`openspec validate lighten-letter-paper-corners --strict --no-interactive` 和 `git diff --check`，确认通过。
