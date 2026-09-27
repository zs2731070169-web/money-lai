## Why

金额里程表的货币标识前缀（`$`，实测反馈「金额携带货币符号」的落地）在真机上不可见：`paintAmountOdometer` 在设置墨青 `fillStyle` **之前**就绘制了货币符号，继承了上游画师（纸币/钱包画师）残留的浅色 `fillStyle`，浅色符号画在浅色背景渐变上即隐形。数字本体在赋值之后绘制故显示正常，导致缺陷只在符号上出现且测试未覆盖。

## What Changes

- `paintAmountOdometer` 的 `fillStyle`（墨青 / 里程碑蜜金混合色）赋值移到所有 `fillText`（货币符号、分隔符、数字）之前，消除对上游画师残留状态的依赖
- 新增回归测试：预置脏 `fillStyle`（模拟上游画师残留浅色）后断言货币符号以墨青色实际渲染

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无——规格层「金额累计反馈」行为不变，属纯缺陷修复，`skip_specs: true`）

## Impact

- `src/core/render/odometer-painter.ts`：`fillStyle` 赋值位置前移（约 4 行移动）
- `tests/render/render-foundations.test.ts`（或新增用例）：货币符号可见性回归断言
- 不影响其他画师与编排层；里程碑闪色语义不变（符号与数字同色过渡）
