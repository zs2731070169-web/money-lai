## REMOVED Requirements

### Requirement: 纸币无限供应
**Reason**: 产品核心物件改为信封与明信片，不再存在纸币供应。
**Migration**: 使用 `letter-burning` 的信封取卡主循环。

### Requirement: 跟手抽钞动画
**Reason**: 抽钞手势被明信片抽取与甩出手势替代。
**Migration**: 使用 `letter-burning` 的信封取卡及甩出行为。

### Requirement: 抽出完成与回收判定
**Reason**: 不再存在纸币抽出结算。
**Migration**: 使用屏高 15% 或 700px/s 的明信片甩出判定。

### Requirement: 抽钞轻点无动作
**Reason**: 主界面不再包含纸币或钱包皮面。
**Migration**: 明信片交互由 `letter-burning` 统一定义。

### Requirement: 宽容抓取
**Reason**: 纸币抓取热区随纸币玩法一起移除。
**Migration**: 信封与明信片使用新布局的手势热区。

### Requirement: 金额累计反馈
**Reason**: 产品定论明确顶部不显示金额或常驻数字。
**Migration**: 集体统计只在规定燃烧次数后浮出；个人累计改为菜单内的本机明信片里程表。

### Requirement: 面额体系
**Reason**: 虚构货币被本地预置明信片图案替代。
**Migration**: 使用 `letter-burning` 的治愈图案分配规则。

### Requirement: 里程碑反馈
**Reason**: 抽钞张数、捆扎和金额里程碑与燃信产品无关。
**Migration**: 使用 `meta-progression` 的燃信成就；达成状态静默记录，仅在菜单内查看，不打断燃烧。

### Requirement: 抽取进度会话化
**Reason**: 会话金额与纸币张数不再存在。
**Migration**: 持久化本机明信片燃烧里程、外观解锁、燃信成就和图鉴；用户内容按 `journal` 持久化，信封与纸纹外观统一以 `assets/envelop/` 真实位图为基底。
