import {
  createInitialPersistedGameState,
  serializePersistedGameState,
} from '../../src/core/meta/game-state';
import { setBedtimeModeEnabled } from '../../src/core/meta/settings';

/**
 * 日间启动存档种子（bedtime-default-on 之后新装默认夜间剖面）：
 * 验证日间行为的无头集成测试用它显式关闭晚安模式，
 * 避免夜间剖面（更慢折叠/更粘跟手）改变按日间时长调好的测试时序。
 */
export const DAYTIME_BOOT_PERSISTED_JSON = serializePersistedGameState(
  setBedtimeModeEnabled(createInitialPersistedGameState(), false),
);
