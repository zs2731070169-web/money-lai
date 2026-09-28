# 已确认的项目约定

- 产品是“燃信”：信封取明信片、翻面写一句、甩出燃烧、自动进入本机手帐。
- OpenSpec 主规格位于 `openspec/specs/`；实施差异位于 `openspec/changes/`。未完成真机验收前不归档大范围视觉变更。
- `src/core/` 不接触平台 API；Canvas、输入、Preferences、临时文件分享、外部链接和匿名计数统一经 `PlatformAdapter`。
- 状态机保持纯函数；副作用由 `Game` 消费 effects。后台恢复的大帧推进量最多按 100ms 处理。
- 新本机状态键是 `letter-burning/state/v1`，旧键 `money-lai/state/v1` 保留用于回滚且永不迁移。
- 手帐条目只含 `{ id, createdAtIso, patternId, text }`；文字可空，只存本机，也不进入长图默认内容。
- 匿名端点只接受空 `POST /burn`，客户端使用 `credentials: omit` 和短超时，服务端只留最近 24 个 UTC 小时聚合桶。
- 导出经官方 Filesystem/Share 临时文件和系统面板；应用不声明照片权限，不直接保存到照片图库。
- 图案、信封、纸纹与音频都随包提供。燃烧画师复用固定 `Float32Array` 缓冲，手帐网格只布局可见行。
- 低音域钢琴只用谐音振荡器和算法延迟混响；钢琴路径不加入噪声，以免产生持续“莎莎”底噪。
- `npm run verify` 是代码门，`npm run verify:specs` 是主规格门；真机结果单独记录。
