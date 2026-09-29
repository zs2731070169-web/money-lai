import { AudioEngine } from './audio/engine';
import { BACK_PROMPTS, COPY } from './content/copy';
import { shouldDisplayBurnCount } from './count/burn-count';
import { computeJournalLayout, maximumJournalScroll } from './journal/journal-layout';
import {
  LETTER_BURNING_STORAGE_KEY, PRIVACY_CONSENT_STORAGE_KEY, activateFontPackage, activateLetterTheme,
  clearJournal, createEmptyLetterLetterState, parseLetterLetterState,
  serializeLetterLetterState, settleCompletedPostcard, type LetterBurningPersistedState,
} from './journal/journal-state';
import {
  MAX_LETTER_TEXT_LENGTH, advanceLetterState, beginDraw, beginEditing, beginTuck, createLetterState,
  endDraw, endTuck, finishEditing, movePointer, resolveCount, setPostcardText,
  type LetterEffect, type LetterState,
} from './letter/letter-state';
import { DEFAULT_POSTCARD_ID, chooseNextPostcardId } from './letter/postcard-catalog';
import { FONT_PACKAGES, fontStackForPackage } from './render/letter-font';
import { LETTER_THEMES, letterThemeById } from './render/letter-theme';
import type { NormalizedTouchPoint, PlatformAdapter, PrimaryCanvas, TouchPhase } from './platform';
import { computeFontPackageItemRects, computePageItemRects, hitJournalCell, journalClearRect, pageBackRect, paintAppOverlay } from './render/app-overlay-painter';
import { paintAdaptiveBackground, planAdaptiveBackground } from './render/background-composition';
import { computeLetterSceneLayout, containsPoint } from './render/letter-layout';
import { paintLetterScene, paintPageFade, type LetterSceneAssets } from './render/letter-painter';
import { computeMenuLayout, type AppPage, type MenuAction } from './render/menu-layout';

const TRANSITION_DURATION_MS = 600;
const REDUCED_TRANSITION_DURATION_MS = 200;
/** 菜单面板滑入/滑出时长；减弱动态效果时缩短。 */
const MENU_PANEL_SLIDE_MS = 240;
const REDUCED_MENU_PANEL_SLIDE_MS = 80;
const CLEAR_JOURNAL_DURATION_MS = 2700;
/** 视口尺寸稳定等待时长：resize/软键盘动画期间沿用旧合成面过渡。 */
const BACKGROUND_COMPOSITION_SETTLE_MS = 180;

export interface GameOptions {
  platformAdapter: PlatformAdapter;
  privacyPolicyUrl?: string | null;
  /** 主题 id → 该主题整套资产 URL（assets/envelop/<id>/）。 */
  letterThemeAssetUrls?: Record<string, {
    background: string;
    closedEnvelope: string;
    openEnvelope?: string;
    openEnvelopeBack?: string;
    openEnvelopeFront?: string;
    letterPaper: string;
  }>;
  /** 随包「信纸抽出」音效素材；缺失时抽信手势静默。 */
  envelopeDrawOutAudioUrl?: string | null;
}

interface TouchStart { x: number; y: number; atMs: number; lastY: number }

function canOpenMenu(phase: LetterState['phase']): boolean {
  // 收好/安静/统计期间不可打断结算时序
  return phase === 'idle' || phase === 'unfold' || phase === 'edit' || phase === 'edit-return' || phase === 'back';
}

/** 抽取音效只看是否出现了新的有效上移，不把单帧位移粗暴舍入到 1px。 */
export function shouldTriggerEnvelopeDrawOut(
  previousState: LetterState,
  nextState: LetterState,
): boolean {
  return previousState.phase === 'draw'
    && nextState.phase === 'draw'
    && previousState.offsetY !== nextState.offsetY;
}

export class Game {
  private readonly platform: PlatformAdapter;
  private readonly privacyPolicyUrl: string | null;
  private readonly letterThemeAssetUrls: GameOptions['letterThemeAssetUrls'];
  private readonly audio: AudioEngine;
  private letterSceneAssets: LetterSceneAssets = {};
  /** 未合成的原始背景位图；竖屏下按视口离屏合成后替换绘制资产。 */
  private backgroundImage: CanvasImageSource | null = null;
  private composedBackground: { source: CanvasImageSource; viewportWidth: number; viewportHeight: number; renderScale: number } | null = null;
  /** 合成分面分配失败的负缓存：同视口尺寸下跳过重试，尺寸变化后自然恢复。 */
  private backgroundCompositionFailure: { viewportWidth: number; viewportHeight: number } | null = null;
  private backgroundViewportWidth = 0;
  private backgroundViewportHeight = 0;
  private backgroundViewportChangedAt: number | null = null;
  private canvas: PrimaryCanvas | null = null;
  private letter: LetterState = createLetterState();
  private persisted: LetterBurningPersistedState = createEmptyLetterLetterState();
  private patternId = DEFAULT_POSTCARD_ID;
  private prompt: string = BACK_PROMPTS[0];
  private page: AppPage = 'main';
  private ready = false;
  private reducedMotion = false;
  private inputActive = false;
  private touchStart: TouchStart | null = null;
  private lastFrameTimestamp: number | null = null;
  private journalScroll = 0;
  private selectedJournalEntry: number | null = null;
  private menuGlowStartedAt: number | null = null;
  /** 菜单面板滑入/滑出动画起点；null 表示不在动画中（面板全开）。 */
  private menuPanelStartedAt: number | null = null;
  /** true 表示正在向右滑出关闭；动画结束后才切回主界面。 */
  private menuPanelClosing = false;
  private transitionElapsedMs: number | null = null;
  private clearJournalElapsedMs: number | null = null;
  private notice: { text: string; until: number } | null = null;
  private savingCycle = false;
  private cycleId = 0;

  private readonly envelopeDrawOutAudioUrl: string | null;

  /** 打开菜单：面板从右侧滑入，行命中立即按最终位置生效。 */
  private openMenuPanel(): void {
    this.page = 'menu';
    this.menuPanelStartedAt = this.platform.nowMilliseconds();
    this.menuPanelClosing = false;
  }

  /** 关闭菜单：面板向右滑出，动画结束后切回主界面并恢复被菜单挂起的编辑。 */
  private beginMenuPanelClose(): void {
    this.menuPanelStartedAt = this.platform.nowMilliseconds();
    this.menuPanelClosing = true;
  }

  /** 菜单面板当前展开比例（0–1）：滑入 easeOut、滑出 easeIn；非菜单页恒为 1。 */
  private menuPanelSlideRatio(): number {
    if (this.page !== 'menu' || this.menuPanelStartedAt === null) return 1;
    const durationMs = this.reducedMotion ? REDUCED_MENU_PANEL_SLIDE_MS : MENU_PANEL_SLIDE_MS;
    const progress = Math.min(1, (this.platform.nowMilliseconds() - this.menuPanelStartedAt) / durationMs);
    if (this.menuPanelClosing) return 1 - progress * progress * progress;
    return 1 - Math.pow(1 - progress, 3);
  }

  /** 滑出动画到达终点：回主界面并补一次被菜单挂起的书写编辑。 */
  private finishMenuPanelClose(): void {
    this.menuPanelStartedAt = null;
    this.menuPanelClosing = false;
    this.page = 'main';
    if (this.letter.phase === 'edit') void this.editPostcardText();
  }

  constructor(options: GameOptions) {
    this.platform = options.platformAdapter;
    this.privacyPolicyUrl = options.privacyPolicyUrl ?? null;
    this.letterThemeAssetUrls = options.letterThemeAssetUrls;
    this.envelopeDrawOutAudioUrl = options.envelopeDrawOutAudioUrl ?? null;
    this.audio = new AudioEngine({ createAudioContext: () => this.platform.createAudioContext() });
  }

  private async loadLetterSceneAssets(): Promise<void> {
    const themeUrls = this.letterThemeAssetUrls?.[letterThemeById(this.persisted.activeThemeId).id];
    if (!themeUrls) return;
    const openEnvelopeBackUrl = themeUrls.openEnvelopeBack ?? themeUrls.openEnvelope;
    const openEnvelopeFrontUrl = themeUrls.openEnvelopeFront ?? themeUrls.openEnvelope;
    const [background, closedEnvelope, openEnvelopeBack, openEnvelopeFront, letterPaper] = await Promise.all([
      this.platform.loadBundledImage(themeUrls.background),
      this.platform.loadBundledImage(themeUrls.closedEnvelope),
      openEnvelopeBackUrl ? this.platform.loadBundledImage(openEnvelopeBackUrl) : Promise.resolve(null),
      openEnvelopeFrontUrl ? this.platform.loadBundledImage(openEnvelopeFrontUrl) : Promise.resolve(null),
      this.platform.loadBundledImage(themeUrls.letterPaper),
    ]);
    // 主题切换后旧合成面失效：连同 composedBackground 一起清空，
    // 否则 refreshBackgroundComposition 会按旧缓存早退，永远不把新合成面写回 letterSceneAssets，
    // 画面退回 cover 兜底并在竖屏裁掉四角装饰
    this.composedBackground = null;
    this.backgroundViewportWidth = 0;
    this.backgroundViewportHeight = 0;
    this.backgroundCompositionFailure = null;
    this.letterSceneAssets = {
      background, closedEnvelope, openEnvelopeBack, openEnvelopeFront,
      openEnvelope: openEnvelopeFront ?? openEnvelopeBack,
      letterPaper,
    };
    this.backgroundImage = background;
  }

  async start(): Promise<void> {
    const storedConsent = await this.platform.readPersistentValue(PRIVACY_CONSENT_STORAGE_KEY);
    let consented = storedConsent === 'true';
    if (!consented) {
      consented = await this.platform.requestPrivacyConsent(this.privacyPolicyUrl);
      if (!consented) return;
      await this.platform.writePersistentValue(PRIVACY_CONSENT_STORAGE_KEY, 'true');
    }
    const serialized = await this.platform.readPersistentValue(LETTER_BURNING_STORAGE_KEY);
    this.persisted = { ...parseLetterLetterState(serialized), privacyConsent: true };
    if (!serialized) await this.persistCurrentState();
    await this.loadLetterSceneAssets();
    // 抽出声素材只取字节，不解码不建上下文；首次实际发声时由引擎惰性解码
    if (this.envelopeDrawOutAudioUrl) {
      this.audio.setEnvelopeDrawOutSample(await this.platform.loadBundledAudio(this.envelopeDrawOutAudioUrl));
    }
    this.chooseNextCard();
    this.reducedMotion = this.platform.prefersReducedMotion();
    this.canvas = this.platform.createPrimaryCanvas();
    this.platform.onTouch((phase, point) => this.handleTouch(phase, point));
    this.platform.onAudioInterruption((phase) => this.audio.handleAudioInterruption(phase));
    this.platform.onAppVisibilityChange((visible) => this.audio.handleAppVisibilityChange(visible));
    this.ready = true;
    this.platform.requestFrame((timestamp) => this.frame(timestamp));
  }

  private async persistCurrentState(): Promise<boolean> {
    return this.platform.writePersistentValue(LETTER_BURNING_STORAGE_KEY, serializeLetterLetterState(this.persisted));
  }

  private chooseNextCard(): void {
    this.patternId = chooseNextPostcardId(this.persisted.collectedPatternIds, () => this.platform.randomUnit());
    this.prompt = BACK_PROMPTS[Math.floor(this.platform.randomUnit() * BACK_PROMPTS.length) % BACK_PROMPTS.length];
  }

  private unlockAudioFromGesture(): void {
    if (!this.audio.isUnlocked() || this.audio.isReunlockRequired()) {
      void this.audio.unlock().then((unlocked) => { if (unlocked) this.audio.startBgm(); });
    } else if (!this.audio.isPlayingBgm()) this.audio.startBgm();
  }

  private handleTouch(phase: TouchPhase, point: NormalizedTouchPoint): void {
    if (!this.ready || this.inputActive || this.transitionElapsedMs !== null || this.clearJournalElapsedMs !== null) return;
    this.unlockAudioFromGesture();
    const now = this.platform.nowMilliseconds();
    if (this.page !== 'main') { this.handleOverlayTouch(phase, point, now); return; }
    const viewport = this.platform.getLogicalViewportSize(); const safe = this.platform.getSafeAreaInsets(); const layout = computeLetterSceneLayout(viewport.width, viewport.height, safe);
    if (phase === 'start') {
      this.touchStart = { x: point.positionX, y: point.positionY, atMs: now, lastY: point.positionY };
      if (containsPoint(layout.menuRect, point.positionX, point.positionY) && canOpenMenu(this.letter.phase)) return;
      if (this.letter.phase === 'idle' && containsPoint(layout.envelopeGrabRect, point.positionX, point.positionY)) {
        this.letter = beginDraw(this.letter, point.pointerId, point.positionY, now);
      } else if (this.letter.phase === 'back' && containsPoint(layout.cardRect, point.positionX, point.positionY)) {
        this.letter = beginTuck(this.letter, point.pointerId, point.positionY, now);
      }
      return;
    }
    if (phase === 'move') {
      const previousState = this.letter;
      if (this.touchStart) this.touchStart.lastY = point.positionY;
      this.letter = movePointer(this.letter, point.pointerId, point.positionY, now);
      if (shouldTriggerEnvelopeDrawOut(previousState, this.letter)) this.audio.envelopeDrawOutPulse();
      return;
    }
    const start = this.touchStart; this.touchStart = null;
    if (!start) return;
    if (containsPoint(layout.menuRect, start.x, start.y) && containsPoint(layout.menuRect, point.positionX, point.positionY) && canOpenMenu(this.letter.phase)) { this.openMenuPanel(); return; }
    if (this.letter.phase === 'draw') {
      const previousState = this.letter;
      this.letter = movePointer(this.letter, point.pointerId, point.positionY, now);
      if (shouldTriggerEnvelopeDrawOut(previousState, this.letter)) this.audio.envelopeDrawOutPulse();
      const update = endDraw(this.letter, point.pointerId); this.letter = update.state; this.audio.finishEnvelopeDrawOutGesture(); this.consumeEffects(update.effects); return;
    }
    if (this.letter.phase === 'back') {
      // 展示位点按信纸重新进入编辑；上滑收好在 drag 分支判定
      const distance = Math.hypot(point.positionX - start.x, point.positionY - start.y);
      if (distance < 10 && now - start.atMs < 450 && containsPoint(layout.cardRect, point.positionX, point.positionY)) {
        this.letter = beginEditing(this.letter);
        void this.editPostcardText();
      }
      return;
    }
    if (this.letter.phase === 'drag') {
      // 释放判定上滑收好：小位移短时点按回编辑，达阈值折回入袋，未达回弹展示位
      const distance = Math.hypot(point.positionX - start.x, point.positionY - start.y);
      if (distance < 10 && now - start.atMs < 450) {
        this.letter = beginEditing(this.letter); void this.editPostcardText(); return;
      }
      const wantsStat = shouldDisplayBurnCount(this.persisted.statCadenceCount + 1);
      const update = endTuck(this.letter, point.pointerId, point.positionY, now, viewport.height, wantsStat);
      this.letter = update.state; this.consumeEffects(update.effects);
    }
  }

  private async editPostcardText(): Promise<void> {
    if (this.inputActive || this.letter.phase !== 'edit' || this.page !== 'main') return;
    this.inputActive = true;
    let pausedForMenu = false;
    try {
      const viewport = this.platform.getLogicalViewportSize();
      const layout = computeLetterSceneLayout(viewport.width, viewport.height, this.platform.getSafeAreaInsets());
      const result = await this.platform.requestMultilineText({
        initialValue: this.letter.text,
        placeholder: this.prompt,
        maxLength: MAX_LETTER_TEXT_LENGTH,
        fontFamily: fontStackForPackage(this.persisted.activeFontPackageId),
        menuRect: layout.menuRect,
      });
      if (result !== null && typeof result === 'object') {
        this.letter = setPostcardText(this.letter, result.draft);
        pausedForMenu = true;
        this.openMenuPanel();
      } else if (result !== null) this.letter = setPostcardText(this.letter, result);
    } finally {
      this.inputActive = false;
      if (!pausedForMenu) this.letter = finishEditing(this.letter);
    }
  }

  private handleOverlayTouch(phase: TouchPhase, point: NormalizedTouchPoint, now: number): void {
    const viewport = this.platform.getLogicalViewportSize(); const safe = this.platform.getSafeAreaInsets();
    if (phase === 'start') { this.touchStart = { x: point.positionX, y: point.positionY, atMs: now, lastY: point.positionY }; return; }
    const start = this.touchStart; if (!start) return;
    if (phase === 'move' && this.page === 'journal' && this.selectedJournalEntry === null) {
      const delta = start.lastY - point.positionY; start.lastY = point.positionY;
      const currentLayout = computeJournalLayout(viewport.width, viewport.height, safe, this.persisted.journalEntries.length, this.journalScroll);
      this.journalScroll = Math.max(0, Math.min(maximumJournalScroll(currentLayout, viewport.height, safe.bottom), this.journalScroll + delta));
      return;
    }
    if (phase !== 'end') return;
    this.touchStart = null;
    if (this.page === 'menu') {
      // 滑出动画进行中忽略触点，避免误触行或重复关闭
      if (this.menuPanelClosing) return;
      const layout = computeMenuLayout(viewport.width, viewport.height, safe);
      // 向右滑动关闭菜单：水平位移达阈值且垂直分量小，避免与行点按冲突
      const swipeDistanceX = point.positionX - start.x;
      const swipeDistanceY = point.positionY - start.y;
      const swipedRight = swipeDistanceX >= 56 && Math.abs(swipeDistanceY) <= 48;
      if (swipedRight || containsPoint(layout.closeRect, point.positionX, point.positionY)) {
        this.beginMenuPanelClose();
        return;
      }
      // 起点在面板外的点按（遮罩区域）同样关闭菜单；从面板内拖出但未达滑动阈值的抬手不触发
      if (!containsPoint(layout.panelRect, start.x, start.y)) {
        this.beginMenuPanelClose();
        return;
      }
      const row = layout.rows.find((item) => containsPoint(item.rect, point.positionX, point.positionY));
      if (row) {
        this.menuPanelStartedAt = null;
        void this.performMenuAction(row.action);
      }
      return;
    }
    if (containsPoint(pageBackRect(safe), point.positionX, point.positionY)) { this.openMenuPanel(); this.selectedJournalEntry = null; return; }
    if (this.page === 'journal') {
      if (this.selectedJournalEntry !== null) { this.selectedJournalEntry = null; return; }
      // 页眉带右上「清空整本手帐」入口（空手帐时由确认流程自然拦截）
      if (containsPoint(journalClearRect(viewport.width, safe), point.positionX, point.positionY)) { void this.requestClearJournal(); return; }
      this.selectedJournalEntry = hitJournalCell(viewport.width, viewport.height, safe, this.persisted.journalEntries.length, this.journalScroll, point.positionX, point.positionY); return;
    }
    if (this.page === 'themes') {
      const rects = computePageItemRects(viewport.width, safe, LETTER_THEMES.length); const index = rects.findIndex((rect) => containsPoint(rect, point.positionX, point.positionY));
      if (index >= 0) {
        const next = activateLetterTheme(this.persisted, LETTER_THEMES[index].id, this.persisted.postcardMileage);
        if (next !== this.persisted) {
          this.persisted = next;
          void this.persistCurrentState();
          void this.loadLetterSceneAssets();
        }
      }
    }
    if (this.page === 'font-packages') {
      const rects = computeFontPackageItemRects(viewport.width, safe, FONT_PACKAGES.length); const index = rects.findIndex((rect) => containsPoint(rect, point.positionX, point.positionY));
      if (index >= 0) { const next = activateFontPackage(this.persisted, FONT_PACKAGES[index].id); if (next !== this.persisted) { this.persisted = next; void this.persistCurrentState(); } }
    }
  }

  private async performMenuAction(action: MenuAction): Promise<void> {
    if (action === 'privacy') { if (this.privacyPolicyUrl) await this.platform.openExternalUrl(this.privacyPolicyUrl); else this.showNotice(COPY.unavailable); return; }
    if (action === 'journal') { this.page = 'main'; this.transitionElapsedMs = 0; return; }
    this.page = action;
  }

  private async requestClearJournal(): Promise<void> {
    if (this.persisted.journalEntries.length === 0) return;
    if (!await this.platform.requestConfirmation(COPY.clearConfirm)) return;
    this.page = 'journal'; this.clearJournalElapsedMs = 0;
  }

  private showNotice(text: string): void { this.notice = { text, until: this.platform.nowMilliseconds() + 2200 }; }

  private consumeEffects(effects: readonly LetterEffect[]): void {
    for (const effect of effects) {
      if (effect === 'requestEdit') void this.editPostcardText();
      else if (effect === 'save') { this.audio.settleLongNote(); void this.completePostcard(); }
      else if (effect === 'reset') { this.cycleId += 1; this.savingCycle = false; this.chooseNextCard(); }
    }
  }

  private async completePostcard(): Promise<void> {
    if (this.savingCycle) return;
    this.savingCycle = true; const cycle = this.cycleId;
    const entry = { id: `${Date.now().toString(36)}-${Math.floor(this.platform.randomUnit() * 1e9).toString(36)}`, createdAtIso: new Date().toISOString(), patternId: this.patternId, text: this.letter.text };
    const next = settleCompletedPostcard(this.persisted, entry);
    const saved = await this.platform.writePersistentValue(LETTER_BURNING_STORAGE_KEY, serializeLetterLetterState(next));
    // 直落 idle 路径 save 与 reset 同批到达：落库结果必须生效，周期守卫只收窄即时反馈与状态回写
    if (saved) {
      this.persisted = next;
      if (cycle === this.cycleId) this.menuGlowStartedAt = this.platform.nowMilliseconds();
    } else if (cycle === this.cycleId) this.showNotice(COPY.saveFailed);
    const count = await this.platform.incrementAnonymousBurnCount();
    if (cycle === this.cycleId) this.letter = resolveCount(this.letter, count);
  }

  private frame(timestamp: number): void {
    const delta = this.lastFrameTimestamp === null ? 0 : Math.max(0, timestamp - this.lastFrameTimestamp); this.lastFrameTimestamp = timestamp;
    const transitionDurationMs = this.reducedMotion ? REDUCED_TRANSITION_DURATION_MS : TRANSITION_DURATION_MS;
    if (this.transitionElapsedMs !== null) { this.transitionElapsedMs += Math.min(delta, 100); if (this.transitionElapsedMs >= transitionDurationMs) { this.transitionElapsedMs = null; this.page = 'journal'; } }
    // 菜单滑出动画到达终点后切回主界面（delta 钳制与转场一致，防后台跳帧跳过）
    if (this.menuPanelClosing && this.menuPanelStartedAt !== null) {
      const durationMs = this.reducedMotion ? REDUCED_MENU_PANEL_SLIDE_MS : MENU_PANEL_SLIDE_MS;
      if (this.platform.nowMilliseconds() - this.menuPanelStartedAt >= durationMs) this.finishMenuPanelClose();
    }
    if (this.clearJournalElapsedMs !== null) {
      this.clearJournalElapsedMs += Math.min(delta, 100);
      if (this.clearJournalElapsedMs >= CLEAR_JOURNAL_DURATION_MS) { this.clearJournalElapsedMs = null; const next = clearJournal(this.persisted); void this.platform.writePersistentValue(LETTER_BURNING_STORAGE_KEY, serializeLetterLetterState(next)).then((saved) => { if (saved) { this.persisted = next; this.journalScroll = 0; this.selectedJournalEntry = null; } else this.showNotice(COPY.saveFailed); }); }
    }
    const update = advanceLetterState(this.letter, delta, this.reducedMotion); this.letter = update.state; this.consumeEffects(update.effects); this.audio.updateBgm(); this.render(); this.platform.requestFrame((nextTimestamp) => this.frame(nextTimestamp));
  }

  /**
   * 竖屏下把横构图背景合成为「中央纸面 + 四角装饰」的视口尺寸位图，
   * 经 assets.backgroundComposed 整幅绘制；只在首次、视口尺寸/像素比变化
   * （稳定 180ms 后）或合成面重新可用时执行，每帧仍是对合成结果的单次 drawImage。
   */
  private refreshBackgroundComposition(viewportWidth: number, viewportHeight: number): void {
    if (!this.backgroundImage) return;
    const plan = planAdaptiveBackground(viewportWidth, viewportHeight);
    if (!plan) {
      // 视口不窄于源图比例：纯 cover 已完整呈现四角，清除合成层走原图通道
      if (this.composedBackground || this.letterSceneAssets.backgroundComposed) {
        this.composedBackground = null;
        this.letterSceneAssets = { ...this.letterSceneAssets, backgroundComposed: null };
      }
      return;
    }
    const renderScale = this.canvas && this.canvas.logicalWidth > 0
      ? this.canvas.renderingContext.canvas.width / this.canvas.logicalWidth
      : 1;
    if (this.composedBackground
      && this.composedBackground.viewportWidth === viewportWidth
      && this.composedBackground.viewportHeight === viewportHeight
      && this.composedBackground.renderScale === renderScale) return;
    // 合成分面在同视口尺寸下持续分配失败时不再每帧重试（负缓存）
    if (this.backgroundCompositionFailure
      && this.backgroundCompositionFailure.viewportWidth === viewportWidth
      && this.backgroundCompositionFailure.viewportHeight === viewportHeight) return;
    // 视口连续变化（resize/软键盘动画）期间先沿用旧合成面整幅拉伸过渡，稳定后再重合成
    const now = this.platform.nowMilliseconds();
    if (this.composedBackground) {
      if (this.backgroundViewportChangedAt === null
        || this.backgroundViewportWidth !== viewportWidth
        || this.backgroundViewportHeight !== viewportHeight) {
        this.backgroundViewportWidth = viewportWidth;
        this.backgroundViewportHeight = viewportHeight;
        this.backgroundViewportChangedAt = now;
      }
      if (now - this.backgroundViewportChangedAt < BACKGROUND_COMPOSITION_SETTLE_MS) return;
    }
    this.backgroundViewportChangedAt = null;
    const pixelWidth = Math.max(1, Math.round(viewportWidth * renderScale));
    const pixelHeight = Math.max(1, Math.round(viewportHeight * renderScale));
    const surface = this.platform.createOffscreenCanvas(pixelWidth, pixelHeight);
    if (!surface) {
      // 合成分面不可用：退回原图 cover 裁切（即修复前行为），并记住失败尺寸
      this.composedBackground = null;
      this.backgroundCompositionFailure = { viewportWidth, viewportHeight };
      this.letterSceneAssets = { ...this.letterSceneAssets, backgroundComposed: null };
      return;
    }
    paintAdaptiveBackground(
      surface, this.backgroundImage, plan, pixelWidth, pixelHeight,
      (layerWidth, layerHeight) => this.platform.createOffscreenCanvas(layerWidth, layerHeight),
    );
    this.backgroundCompositionFailure = null;
    this.composedBackground = { source: surface.sourceSurface, viewportWidth, viewportHeight, renderScale };
    this.letterSceneAssets = { ...this.letterSceneAssets, backgroundComposed: surface.sourceSurface };
  }

  private render(): void {
    if (!this.canvas) return;
    const context = this.canvas.renderingContext; const viewport = this.platform.getLogicalViewportSize(); const safe = this.platform.getSafeAreaInsets();
    this.refreshBackgroundComposition(viewport.width, viewport.height);
    const layout = computeLetterSceneLayout(viewport.width, viewport.height, safe);
    const glowProgress = this.menuGlowStartedAt === null ? 0 : Math.min(1, (this.platform.nowMilliseconds() - this.menuGlowStartedAt) / 800);
    if (glowProgress >= 1) this.menuGlowStartedAt = null;
    // 输入面板激活期间书写内容由输入层独占：信纸不再画引导语与旧文字，避免透明面板下叠印
    const paperWritingHidden = this.inputActive;
    paintLetterScene(context, { width: viewport.width, height: viewport.height, layout, state: paperWritingHidden ? { ...this.letter, text: '' } : this.letter, fontPackageId: this.persisted.activeFontPackageId, menuGlowProgress: glowProgress, reducedMotion: this.reducedMotion, assets: this.letterSceneAssets });
    if (this.page !== 'main') paintAppOverlay(context, { width: viewport.width, height: viewport.height, safeArea: safe, page: this.page, state: this.persisted, journalScroll: this.journalScroll, selectedEntryIndex: this.selectedJournalEntry, menuSlideRatio: this.menuPanelSlideRatio(), background: this.letterSceneAssets.background, backgroundComposed: this.letterSceneAssets.backgroundComposed, openEnvelope: this.letterSceneAssets.openEnvelope, letterPaper: this.letterSceneAssets.letterPaper });
    if (this.transitionElapsedMs !== null) { const durationMs = this.reducedMotion ? REDUCED_TRANSITION_DURATION_MS : TRANSITION_DURATION_MS; const ratio = Math.min(1, this.transitionElapsedMs / durationMs); context.fillStyle = `rgba(78,61,49,${0.38 * Math.sin(ratio * Math.PI)})`; context.fillRect(0, 0, viewport.width, viewport.height); }
    if (this.clearJournalElapsedMs !== null) paintPageFade(context, viewport.width, viewport.height, Math.min(1, this.clearJournalElapsedMs / CLEAR_JOURNAL_DURATION_MS));
    if (this.notice && this.notice.until > this.platform.nowMilliseconds()) { context.save(); context.fillStyle = 'rgba(73,88,83,.82)'; context.font = "13px ui-rounded,'PingFang SC',sans-serif"; context.textAlign = 'center'; context.fillText(this.notice.text, viewport.width / 2, viewport.height - safe.bottom - 34); context.restore(); } else if (this.notice) this.notice = null;
  }

  getTestSnapshot() {
    return { ready: this.ready, phase: this.letter.phase, page: this.page, inputActive: this.inputActive, patternId: this.patternId, persisted: structuredClone(this.persisted), clearJournalActive: this.clearJournalElapsedMs !== null };
  }
}
