# 燃信项目速查

## 常用命令

```bash
npm run verify
npm run verify:specs
openspec validate rebuild-letter-burning-experience --strict --no-interactive
npm run launch
```

## 代码地图

- `src/core/game.ts`：启动、帧循环、触点路由与副作用编排。
- `src/core/letter/`：燃烧状态机与 24 个预置图案。
- `src/core/journal/`：版本化本机状态、虚拟网格和隐私安全的长图画师。
- `src/core/meta/postcard-progress.ts`：明信片里程、双槽外观与成就。
- `src/core/render/`：布局、固定采样火线、信封/明信片、页面画师。
- `src/core/audio/`：程序化纸声、火声与低音域钢琴。
- `src/core/platform.ts`：唯一平台契约；`src/adapters/` 是 Web/Capacitor 实现。
- `worker/`：最近 24 小时匿名聚合计数。

## 关键纪律

- 首次隐私同意前只可读取独立同意门，不读取手帐、不建音频上下文、不联网。
- 用户文字不进入网络、图鉴默认页或长图；导出不写照片图库。
- 燃烧开始后触摸无效；2.7 秒火线、0.8 秒余光、1.8 秒静默和可选 3 秒统计均由单调时钟推进。
- 清空手帐不调用匿名计数，也不重置里程、外观和成就。
- 主界面无常驻数字；里程、图鉴、外观、成就只在菜单页查看。
