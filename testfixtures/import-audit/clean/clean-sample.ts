// 干净样例：平台能力仅经 PlatformAdapter 接口访问（仅供审计脚本自检）
import type { PlatformAdapter } from '../../../src/core/platform';

export function probeViewportWidth(adapter: PlatformAdapter): number {
  return adapter.getLogicalViewportSize().width;
}
