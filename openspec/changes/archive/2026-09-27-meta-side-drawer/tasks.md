# tasks：元进程右侧滑出抽屉 + 汉堡入口

- [x] 1 抽屉布局纯函数重写（TDD 先红）：`overlay-layout.ts` 改为抽屉几何 + 菜单/页面两级 + `openProgress` 平移入参，新增 `tests/meta/drawer-layout.test.ts`（贴右缘/安全区高度/菜单 4 行/返回钮/平移单调/命中解析含动画期防护与衬底关闭），单测全绿即验证
- [x] 2 画师重排：`overlay-painter.ts` 抽屉铬件（贴右缘圆角、投影、衬底）+ 菜单行 + 页面头部返回行（页面态不显示标题），四页内容区自适应重排（窄抽屉皮肤网格 2 列），既有页面断言不回退即验证
- [x] 3 入口按钮 + 编排接线：`game.ts` 圆圈+圆点改汉堡三横线；抽屉会话态（opening/open/closing 进度推进，进 180ms/出 140ms）替换 `overlayPage`，命中路由按 D2 规则（动画期仅衬底、展开期按钮表、打开期间短路主画面手势），`tap-routing` 用例扩展通过即验证
- [x] 4 全量回归与部署走查：`npm test` + `npx tsc --noEmit` 通过（唯一红为 `physical-bill-stack-reveal` 在途 WIP 的里程表安全区存量失败，非本变更范围）；审查修复（皮肤卡高自适应收进面板 + 面板裁剪兜底 + 一帧窗口短路守卫）后 `npm run launch` 部署 iPhone 17 模拟器，静置审计（无 HUD 残留）→ 唤出 → 四页往返 → 衬底关闭，用户确认后勾选
- [x] 5 右滑收回（实测反馈追加）：抽屉触摸起点记录 + move 定向阈值触发关闭（24px 横移且大于纵移，信号语义不跟手），tap-routing 补「右滑关闭/纵滑不关/轻微滑动不关」三用例，部署复验手感后勾选
- [x] 轻提示抽屉抑制：抽屉打开期间不画 floatingToasts，关闭后恢复（先红测试 tests/meta/toast-drawer-suppression.test.ts）
- [x] 抽屉动画性能：页面数据按签名缓存 + 投影改左缘渐隐暗条（先红 tests/meta/drawer-render-perf.test.ts；真机 gfxinfo 前后对照）
