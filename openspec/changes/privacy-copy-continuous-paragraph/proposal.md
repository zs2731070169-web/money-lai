# Proposal: privacy-copy-continuous-paragraph — 隐私政策正文并为连续段落

## Why

隐私政策页渲染已具备逐字贪心折行（`wrapTextToWidth`，此前实测反馈修复），
文案数组里的硬编码换行与空行成了冗余：四句正文被强制切成四段短行，
折行宽度不一时观感破碎。工作区遗留的文案并段微调（用户手改）把它并为
一个连续段落，由折行器自然换行。

## What Changes

- `PRIVACY_POLICY_TEXT_LINES` 四句正文并为一项、去掉段间空行项（标题行与
  联系方式行不动），渲染输出由逐字折行接管。
- 纯文案排版微调，无行为/交互/规格场景变化（meta-progression 仅约束
  「隐私政策入口可达」），`skip_specs: true`。

## Impact

- 代码：`src/core/render/overlay-painter.ts` 常量数组一处（工作区已有改动）。
- 测试：无测试锁定该文案结构，快照面零变化；`npm test` 全量回归确认。
