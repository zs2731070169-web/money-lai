# design：元进程右侧滑出抽屉

## Context

现状：`overlay-layout.ts` 的 `computeOverlayLayout` 生成居中面板 + 顶部 4 标签几何，`overlay-painter.ts` 据此绘制，`game.ts:848` 绘制圆圈+圆点入口并按 26px 半径命中路由到图鉴页。布局与命中共用一份纯函数（「看到的 = 可点的」），此纪律必须延续。覆盖层当前无开合动画、无专属单测。

## Goals / Non-Goals

**Goals**：抽屉容器 + 两级导航 + 滑入滑出动画 + 汉堡入口 + 右滑收回；布局/命中仍为纯函数并补齐单测。
**Non-Goals**：不做抽屉内滚动、不新增音效/触觉、不动元进程数据层。
（实测反馈追加：右滑收回——初版 Non-Goal 明确排除，用户走查后要求加上。）
（审查修正：初版假设「各页内容塞得下」被 9 款皮肤实测证伪——皮肤卡高改为按抽屉可用高自适应收进面板，画师另加面板矩形裁剪兜底；短路守卫去掉对首帧布局的依赖，杜绝开抽屉后一帧窗口内触摸漏进主场景手势。）

## 决策

### D1 几何（纯函数，进度入参）
`computeOverlayLayout` 重写为抽屉几何：`drawerRect = { left: viewportWidth - drawerWidth, top: safeArea.top, width: min(viewportWidth * 0.8, 400), height: viewportHeight - safeArea.top - safeArea.bottom }`。开合进度 `openProgress(0~1)` 作为入参，画布平移量 `translateX = (1 - openProgress) * drawerWidth`——布局无时钟、无副作用，动画推进由 game.ts 每帧算好进度再调用。首屏菜单：4 行（图鉴/皮肤/成就/设置）等高置于抽屉上部；页面态：头部行（‹ 返回 + 页名）+ 内容区。隐私页沿用页面态，返回目标为设置页。

### D2 状态机与动画
game.ts 内新增抽屉会话态：`null | { phase: 'opening' | 'open' | 'closing', page: 'menu' | OverlayPageKind, progress }`。opening/closing 每帧按单调时钟推进（进 180ms / 出 140ms，缓出/缓入），closing 走到 0 清空状态。菜单 → 页面切换为瞬时（无二级动画，抽屉保持展开）。替代现有 `overlayPage: OverlayPageKind | null` 字段，命中路由改为：progress < 1 时仅衬底命中有效（关闭）；progress = 1 时按布局按钮表解析（菜单行 / 返回 / 开关 / 皮肤卡 / 关闭）。

### D3 入口按钮
右上角锚点（`scene-layout.ts` 的 `metaEntryAnchor`）绘制汉堡形：三条墨青横线（线宽 2、行距 5、居中于 26px 视觉框），命中沿用现有 26px 半径圆判定（不变）。替换圆圈+圆点画法。

### D4 页内容重排
`overlay-painter.ts` 四个页面画师的绘制区域从「面板内容区」改为「抽屉内容区」入参，内部条目几何随内容区宽度自适应；皮肤网格列数在窄抽屉（< 340px 内容宽）下取 2 列、否则 3 列。抽屉铬件（圆角面板、投影、衬底）复用现有色板常量，右侧圆角改为 0（贴屏幕右缘）。实测反馈微调：头部标题仅首屏菜单显示，二级页面头部只留返回钮 + 关闭 ×。

### D5 回归与验证
- 新增 `tests/meta/drawer-layout.test.ts`：抽屉几何端点（贴右缘、安全区高度）、菜单 4 行矩形、页面态返回按钮存在、`openProgress` 平移量单调、命中解析（展开期按钮命中/动画期仅衬底/衬底关闭）。
- `tests/wallet/tap-routing.test.ts` 补入口命中与抽屉打开期间主画面手势隔离的路由断言。
- 冒烟：`npm test` + `npm run build` 后 `cap sync` 部署模拟器走查（静置审计 → 唤出 → 四页往返 → 衬底关闭）。

### D6 右滑收回（实测反馈追加）
抽屉打开期间的触摸在 start 记录起点（pointerId + 坐标）；move 中计算定向位移，横向右移 ≥24px 且大于纵向位移即 `beginDrawerClose()`。**信号语义不跟手**（与翻盖滑动触发同一设计语言，不做拖拽平移抽屉的连续交互）；起点在按钮上时按钮动作已在 start 时刻照常触发（现行命中语义不变），随后右滑仍可关闭。触点 end 或抽屉会话清空时丢弃起点。逐帧成本为常量算术，无渲染开销。

### 风险
- game.ts 手势路由与覆盖层命中的优先级交织：抽屉打开期间必须短路全部翻盖/抽钞手势（现状已按 overlayPage 短路，迁移到新状态同语义，靠 tap-routing 用例锁死）。
- 皮肤网格列数变化导致既有皮肤页断言（若有）漂移——实现时先跑相关测试确认。
