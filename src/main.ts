import { createWebPlatformAdapter } from './adapters/web';
import { Game } from './core/game';
import { assertDesignTokenCoverage } from './core/render/design-tokens';

/**
 * Web 入口：注入 Web 平台适配器并启动游戏编排。
 * （未来小游戏入口：main-minigame.ts 注入 WxPlatformAdapter，内核零改动）
 */
// 启动期守卫：面额色相令牌缺档直接快速失败（防止带病渲染）
assertDesignTokenCoverage();

const platformAdapter = createWebPlatformAdapter();
const game = new Game({ platformAdapter });
game.start();
