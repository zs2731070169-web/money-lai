## 1. 收好复位保留信纸原文

- [x] 1.1 状态机三处复位转移（settle 直落、quiet 跳过统计、stat 完成）保留 `text`，先红后绿锁定：复位后 phase=idle 且 text 不丢；验证：`npm test -- tests/letter/`。
- [x] 1.2 流程级断言：写入→确认收好→推进复位→再次抽出进入编辑，输入层 initialValue 等于原文；打开手帐往返后原文仍在；验证：`npm test -- tests/letter/ tests/menu/`，模拟器实测抽出原文可读可续写。
