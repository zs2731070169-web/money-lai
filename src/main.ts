import { createWebPlatformAdapter } from './adapters/web';
import { loadLetterHandwritingFont } from './adapters/font-loader';
import { Game } from './core/game';

/**
 * Web 入口：注入 Web 平台适配器并启动游戏编排。
 * （未来小游戏入口：main-minigame.ts 注入 WxPlatformAdapter，内核零改动）
 */
const platformAdapter = createWebPlatformAdapter();
const game = new Game({
  platformAdapter,
  privacyPolicyUrl: import.meta.env.VITE_PRIVACY_POLICY_URL?.trim() || null,
  letterSceneAssetUrls: {
    background: new URL('../assets/envelop/topic1/background.png', import.meta.url).href,
    closedEnvelope: new URL('../assets/envelop/topic1/closed_envelope.png', import.meta.url).href,
    openEnvelopeBack: new URL('../assets/envelop/topic1/open_envelope_back.png', import.meta.url).href,
    openEnvelopeFront: new URL('../assets/envelop/topic1/open_envelope_front.png', import.meta.url).href,
    letterPaper: new URL('../assets/envelop/topic1/letter_paper.png', import.meta.url).href,
  },
});
void (async () => {
  await loadLetterHandwritingFont();
  await game.start();
})();
