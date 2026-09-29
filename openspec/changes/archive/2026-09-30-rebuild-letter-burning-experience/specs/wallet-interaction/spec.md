## REMOVED Requirements

### Requirement: 钱包静置状态
**Reason**: 主视觉物件由钱包改为信封与明信片。
**Migration**: 使用 `letter-burning` 的信封初始状态。

### Requirement: 手势触发开合（滑动即信号）
**Reason**: 不再存在钱包翻盖开合。
**Migration**: 上滑用于从信封抽取明信片或甩出背面明信片。

### Requirement: 翻盖轻点无动作
**Reason**: 钱包翻盖与皮面已从产品中移除。
**Migration**: 明信片正反面与输入交互由 `letter-burning` 定义。

### Requirement: 真实物理的自主折叠（顶边铰链）
**Reason**: 三维翻盖动画不属于信封与明信片产品形态。
**Migration**: 删除翻盖投影系统，新增明信片跟手、回弹和燃烧状态机。

### Requirement: 开合的反馈
**Reason**: 钱包开合音效与触觉不再有对应动作。
**Migration**: 使用明信片拖拽、点燃、燃烧与熄灭声景。

### Requirement: 开启状态的可视呈现
**Reason**: 不再通过打开钱包暴露纸币堆。
**Migration**: 初始信封直接露出下一张明信片边缘，不展示首次引导文案。
