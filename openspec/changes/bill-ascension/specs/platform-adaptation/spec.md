## MODIFIED Requirements

### Requirement: 平台无关内核纪律
游戏内核（玩法、渲染编排、音效合成逻辑）SHALL NOT 直接引用任何平台专有接口（浏览器专有、iOS 壳插件、微信 API）；全部平台能力 MUST 经由适配层接口进出。该约束 SHALL 以静态检查（导入审计）纳入回归验证。文本输入（心事输入，worry-release 规格）SHALL 经适配器接口 `presentTextInput` 提供：入参为占位文案与长度上限，返回用户确认的文本或取消（null）；DOM 输入框与系统输入法等平台细节 MUST ONLY 存在于适配器实现内。

#### Scenario: 内核依赖审计
- **WHEN** 对内核目录运行平台依赖静态检查
- **THEN** 无任何平台专有模块的直接引用，平台能力全部经由适配层接口

#### Scenario: 平台注入假输入
- **WHEN** 测试以假适配器注入 `presentTextInput` 实现
- **THEN** 内核心事输入流程可完整驱动（确认/取消两路径）而无平台依赖
