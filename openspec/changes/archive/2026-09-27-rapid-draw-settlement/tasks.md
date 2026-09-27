# tasks：连续快速抽钞的完成结算

- [x] 1 状态机 TDD（先红后绿）：`draw-judgment.test.ts` 补 grab 三态用例（completing → 发 bill-draw-completed + 新会话 / recycling → 纯重置 / idle·dragging → 原样），改实现至全绿
- [x] 2 编排接线：`beginBillGrab` 先结算在途张再分配新面额（顺序修正）；`tap-routing` 接管用例期望 1→2 张 + 新增三连发快抽计数用例，全绿即验证
- [x] 3 全量回归与部署：`npx tsc --noEmit` + `npm test`（本次 tsc/npm test 红均属并行在途线：flap-rounded-outline 与 render-foundations，本变更文件 42/42 全绿），vite 直构部署 iPhone 17 模拟器，用户快连抽实测计数无误后勾选
