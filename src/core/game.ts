import { AudioEngine } from './audio/engine';
import { BACK_PROMPTS, COPY } from './content/copy';
import { shouldDisplayBurnCount } from './count/burn-count';
import { computeJournalExportPlan, paintJournalExport } from './journal/export';
import { computeJournalLayout, maximumJournalScroll } from './journal/journal-layout';
import {
  LETTER_BURNING_STORAGE_KEY, PRIVACY_CONSENT_STORAGE_KEY, activateAppearance,
  clearJournal, createEmptyLetterBurningState, parseLetterBurningState,
  serializeLetterBurningState, settleCompletedPostcard, type LetterBurningPersistedState,
} from './journal/journal-state';
import {
  BURN_DURATION_MS, advanceBurningState, beginDraw, beginThrow, createBurningState,
  endDraw, endThrow, flipToBack, movePointer, resolveCount, setPostcardText,
  type BurningEffect, type BurningState,
} from './letter/burning-state';
import { chooseNextPatternId, patternById } from './letter/patterns';
import { APPEARANCES } from './meta/postcard-progress';
import type { NormalizedTouchPoint, PlatformAdapter, PrimaryCanvas, TouchPhase } from './platform';
import { computeGalleryLayout, computePageItemRects, hitJournalCell, pageBackRect, paintAppOverlay } from './render/app-overlay-painter';
import { createBurnGeometryBuffer } from './render/burn-geometry';
import { paintAdaptiveBackground, planAdaptiveBackground } from './render/background-composition';
import { computeLetterSceneLayout, containsPoint } from './render/letter-layout';
import { paintLetterScene, paintPageBurn, type LetterSceneAssets } from './render/letter-painter';
import { computeMenuLayout, type AppPage, type MenuAction } from './render/menu-layout';

const TRANSITION_DURATION_MS = 600;
const REDUCED_TRANSITION_DURATION_MS = 200;
const CLEAR_JOURNAL_DURATION_MS = 2700;
/** 视口尺寸稳定等待时长：resize/软键盘动画期间沿用旧合成面过渡。 */
const BACKGROUND_COMPOSITION_SETTLE_MS = 180;

export interface GameOptions {
  platformAdapter: PlatformAdapter;
  privacyPolicyUrl?: string | null;
  letterSceneAssetUrls?: {
    background: string;
    closedEnvelope: string;
    openEnvelope: string;
    letterPaper: string;
  };
}

interface TouchStart { x: number; y: number; atMs: number; lastY: number }

export class Game {
  private readonly platform: PlatformAdapter;
  private readonly privacyPolicyUrl: string | null;
  private readonly letterSceneAssetUrls: GameOptions['letterSceneAssetUrls'];
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
  private burning: BurningState = createBurningState();
  private persisted: LetterBurningPersistedState = createEmptyLetterBurningState();
  private patternId = 'postcard-01';
  private prompt: string = BACK_PROMPTS[0];
  private page: AppPage = 'main';
  private ready = false;
  private reducedMotion = false;
  private inputActive = false;
  private touchStart: TouchStart | null = null;
  private lastFrameTimestamp: number | null = null;
  private journalScroll = 0;
  private galleryScroll = 0;
  private selectedJournalEntry: number | null = null;
  private menuGlowStartedAt: number | null = null;
  private transitionElapsedMs: number | null = null;
  private clearJournalElapsedMs: number | null = null;
  private notice: { text: string; until: number } | null = null;
  private savingCycle = false;
  private cycleId = 0;
  private readonly burnGeometry = createBurnGeometryBuffer();
  private readonly clearBurnGeometry = createBurnGeometryBuffer();

  constructor(options: GameOptions) {
    this.platform = options.platformAdapter;
    this.privacyPolicyUrl = options.privacyPolicyUrl ?? null;
    this.letterSceneAssetUrls = options.letterSceneAssetUrls;
    this.audio = new AudioEngine({ createAudioContext: () => this.platform.createAudioContext() });
  }

  private async loadLetterSceneAssets(): Promise<void> {
    if (!this.letterSceneAssetUrls) return;
    const [background, closedEnvelope, openEnvelope, letterPaper] = await Promise.all([
      this.platform.loadBundledImage(this.letterSceneAssetUrls.background),
      this.platform.loadBundledImage(this.letterSceneAssetUrls.closedEnvelope),
      this.platform.loadBundledImage(this.letterSceneAssetUrls.openEnvelope),
      this.platform.loadBundledImage(this.letterSceneAssetUrls.letterPaper),
    ]);
    this.letterSceneAssets = { background, closedEnvelope, openEnvelope, letterPaper };
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
    this.persisted = { ...parseLetterBurningState(serialized), privacyConsent: true };
    if (!serialized) await this.persistCurrentState();
    await this.loadLetterSceneAssets();
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
    return this.platform.writePersistentValue(LETTER_BURNING_STORAGE_KEY, serializeLetterBurningState(this.persisted));
  }

  private chooseNextCard(): void {
    this.patternId = chooseNextPatternId(this.persisted.collectedPatternIds, () => this.platform.randomUnit());
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
      if (containsPoint(layout.menuRect, point.positionX, point.positionY) && this.burning.phase === 'idle') return;
      if (this.burning.phase === 'idle' && (containsPoint(layout.exposedCardRect, point.positionX, point.positionY) || containsPoint(layout.envelopeRect, point.positionX, point.positionY))) {
        this.burning = beginDraw(this.burning, point.pointerId, point.positionY, now); this.audio.startRustle();
      } else if (this.burning.phase === 'back' && containsPoint(layout.cardRect, point.positionX, point.positionY)) {
        this.burning = beginThrow(this.burning, point.pointerId, point.positionY, now); this.audio.startRustle();
      }
      return;
    }
    if (phase === 'move') {
      if (this.touchStart) this.touchStart.lastY = point.positionY;
      this.burning = movePointer(this.burning, point.pointerId, point.positionY, now); return;
    }
    const start = this.touchStart; this.touchStart = null;
    if (!start) return;
    if (containsPoint(layout.menuRect, start.x, start.y) && containsPoint(layout.menuRect, point.positionX, point.positionY) && this.burning.phase === 'idle') { this.page = 'menu'; return; }
    if (this.burning.phase === 'draw') {
      this.burning = movePointer(this.burning, point.pointerId, point.positionY, now);
      const update = endDraw(this.burning, point.pointerId); this.burning = update.state; this.consumeEffects(update.effects); this.audio.stopRustle(); return;
    }
    if (this.burning.phase === 'front') {
      if (containsPoint(layout.cardRect, point.positionX, point.positionY)) this.burning = flipToBack(this.burning); return;
    }
    if (this.burning.phase === 'drag') {
      const distance = Math.hypot(point.positionX - start.x, point.positionY - start.y);
      if (distance < 10 && now - start.atMs < 450) {
        this.burning = { ...this.burning, phase: 'back', pointerId: null, offsetY: 0, tiltDegrees: 0 }; this.audio.stopRustle(); void this.editPostcardText(); return;
      }
      const wantsStat = shouldDisplayBurnCount(this.persisted.statCadenceCount + 1);
      const update = endThrow(this.burning, point.pointerId, point.positionY, now, viewport.height, wantsStat);
      this.burning = update.state; this.consumeEffects(update.effects);
      if (this.burning.phase === 'rebound') this.audio.stopRustle();
    }
  }

  private async editPostcardText(): Promise<void> {
    if (this.inputActive || this.burning.phase !== 'back') return;
    this.inputActive = true;
    try {
      const result = await this.platform.requestSingleLineText({ initialValue: this.burning.text, placeholder: this.prompt, maxLength: 120 });
      if (result !== null) this.burning = setPostcardText(this.burning, result);
    } finally { this.inputActive = false; }
  }

  private handleOverlayTouch(phase: TouchPhase, point: NormalizedTouchPoint, now: number): void {
    const viewport = this.platform.getLogicalViewportSize(); const safe = this.platform.getSafeAreaInsets();
    if (phase === 'start') { this.touchStart = { x: point.positionX, y: point.positionY, atMs: now, lastY: point.positionY }; return; }
    const start = this.touchStart; if (!start) return;
    if (phase === 'move' && ((this.page === 'journal' && this.selectedJournalEntry === null) || this.page === 'gallery')) {
      const delta = start.lastY - point.positionY; start.lastY = point.positionY;
      if (this.page === 'journal') {
        const currentLayout = computeJournalLayout(viewport.width, viewport.height, safe, this.persisted.journalEntries.length, this.journalScroll);
        this.journalScroll = Math.max(0, Math.min(maximumJournalScroll(currentLayout, viewport.height, safe.bottom), this.journalScroll + delta));
      } else {
        const maximumScroll = computeGalleryLayout(viewport.width, viewport.height, safe, this.galleryScroll).maximumScroll;
        this.galleryScroll = Math.max(0, Math.min(maximumScroll, this.galleryScroll + delta));
      }
      return;
    }
    if (phase !== 'end') return;
    this.touchStart = null;
    if (this.page === 'menu') {
      const layout = computeMenuLayout(viewport.width, viewport.height, safe);
      if (containsPoint(layout.closeRect, point.positionX, point.positionY)) { this.page = 'main'; return; }
      const row = layout.rows.find((item) => containsPoint(item.rect, point.positionX, point.positionY));
      if (row) void this.performMenuAction(row.action);
      return;
    }
    if (containsPoint(pageBackRect(safe), point.positionX, point.positionY)) { this.page = 'menu'; this.selectedJournalEntry = null; return; }
    if (this.page === 'journal') {
      if (this.selectedJournalEntry !== null) { this.selectedJournalEntry = null; return; }
      this.selectedJournalEntry = hitJournalCell(viewport.width, viewport.height, safe, this.persisted.journalEntries.length, this.journalScroll, point.positionX, point.positionY); return;
    }
    if (this.page === 'appearances') {
      const rects = computePageItemRects(viewport.width, safe, APPEARANCES.length); const index = rects.findIndex((rect) => containsPoint(rect, point.positionX, point.positionY));
      if (index >= 0) { const next = activateAppearance(this.persisted, APPEARANCES[index].id); if (next !== this.persisted) { this.persisted = next; void this.persistCurrentState(); } }
    }
  }

  private async performMenuAction(action: MenuAction): Promise<void> {
    if (action === 'help') { await this.platform.openExternalUrl('tel:12355'); return; }
    if (action === 'privacy') { if (this.privacyPolicyUrl) await this.platform.openExternalUrl(this.privacyPolicyUrl); else this.showNotice(COPY.unavailable); return; }
    if (action === 'export') { await this.exportJournal(); return; }
    if (action === 'clear') { await this.requestClearJournal(); return; }
    if (action === 'journal') { this.page = 'main'; this.transitionElapsedMs = 0; return; }
    this.page = action;
  }

  private async exportJournal(): Promise<void> {
    const plan = computeJournalExportPlan(this.persisted.journalEntries.length); const surface = this.platform.createOffscreenCanvas(plan.width, plan.height);
    if (!surface) { this.showNotice(COPY.exportFailed); return; }
    paintJournalExport(surface.renderingContext, this.persisted.journalEntries, plan, this.letterSceneAssets.letterPaper, this.persisted.activePaperAppearanceId);
    const base64Data = await this.platform.encodePng(surface);
    if (!base64Data) { this.showNotice(COPY.exportFailed); return; }
    const result = await this.platform.shareTemporaryPng({ fileName: `${COPY.exportFilePrefix}-${new Date().toISOString().slice(0, 10)}.png`, base64Data, title: COPY.journal });
    if (result === 'failed') this.showNotice(COPY.exportFailed);
  }

  private async requestClearJournal(): Promise<void> {
    if (this.persisted.journalEntries.length === 0) return;
    if (!await this.platform.requestConfirmation(COPY.clearConfirm)) return;
    this.page = 'journal'; this.clearJournalElapsedMs = 0;
  }

  private showNotice(text: string): void { this.notice = { text, until: this.platform.nowMilliseconds() + 2200 }; }

  private consumeEffects(effects: readonly BurningEffect[]): void {
    for (const effect of effects) {
      if (effect === 'ignite') this.audio.ignite();
      else if (effect === 'prepareIgnition') this.audio.stopRustle();
      else if (effect === 'extinguish') this.audio.extinguish();
      else if (effect === 'save') void this.completePostcard();
      else if (effect === 'reset') { this.cycleId += 1; this.savingCycle = false; this.chooseNextCard(); }
    }
  }

  private async completePostcard(): Promise<void> {
    if (this.savingCycle) return;
    this.savingCycle = true; const cycle = this.cycleId;
    const entry = { id: `${Date.now().toString(36)}-${Math.floor(this.platform.randomUnit() * 1e9).toString(36)}`, createdAtIso: new Date().toISOString(), patternId: this.patternId, text: this.burning.text };
    const next = settleCompletedPostcard(this.persisted, entry);
    const saved = await this.platform.writePersistentValue(LETTER_BURNING_STORAGE_KEY, serializeLetterBurningState(next));
    if (cycle !== this.cycleId) return;
    if (saved) { this.persisted = next; this.menuGlowStartedAt = this.platform.nowMilliseconds(); }
    else this.showNotice(COPY.saveFailed);
    const count = await this.platform.incrementAnonymousBurnCount();
    if (cycle === this.cycleId) this.burning = resolveCount(this.burning, count);
  }

  private frame(timestamp: number): void {
    const delta = this.lastFrameTimestamp === null ? 0 : Math.max(0, timestamp - this.lastFrameTimestamp); this.lastFrameTimestamp = timestamp;
    const transitionDurationMs = this.reducedMotion ? REDUCED_TRANSITION_DURATION_MS : TRANSITION_DURATION_MS;
    if (this.transitionElapsedMs !== null) { this.transitionElapsedMs += Math.min(delta, 100); if (this.transitionElapsedMs >= transitionDurationMs) { this.transitionElapsedMs = null; this.page = 'journal'; } }
    if (this.clearJournalElapsedMs !== null) {
      this.clearJournalElapsedMs += Math.min(delta, 100);
      if (this.clearJournalElapsedMs >= CLEAR_JOURNAL_DURATION_MS) { this.clearJournalElapsedMs = null; const next = clearJournal(this.persisted); void this.platform.writePersistentValue(LETTER_BURNING_STORAGE_KEY, serializeLetterBurningState(next)).then((saved) => { if (saved) { this.persisted = next; this.journalScroll = 0; this.selectedJournalEntry = null; } else this.showNotice(COPY.saveFailed); }); }
    }
    const update = advanceBurningState(this.burning, delta, this.reducedMotion); this.burning = update.state; this.consumeEffects(update.effects); this.audio.updateBgm(); this.render(); this.platform.requestFrame((nextTimestamp) => this.frame(nextTimestamp));
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
    paintLetterScene(context, { width: viewport.width, height: viewport.height, layout, state: this.burning, patternId: this.patternId, prompt: this.prompt, envelopeAppearanceId: this.persisted.activeEnvelopeAppearanceId, paperAppearanceId: this.persisted.activePaperAppearanceId, burnGeometry: this.burnGeometry, burnSeed: patternById(this.patternId).seed + this.persisted.postcardMileage, menuGlowProgress: glowProgress, assets: this.letterSceneAssets });
    if (this.page !== 'main') paintAppOverlay(context, { width: viewport.width, height: viewport.height, safeArea: safe, page: this.page, state: this.persisted, journalScroll: this.journalScroll, galleryScroll: this.galleryScroll, selectedEntryIndex: this.selectedJournalEntry, background: this.letterSceneAssets.background, backgroundComposed: this.letterSceneAssets.backgroundComposed, openEnvelope: this.letterSceneAssets.openEnvelope, letterPaper: this.letterSceneAssets.letterPaper });
    if (this.transitionElapsedMs !== null) { const durationMs = this.reducedMotion ? REDUCED_TRANSITION_DURATION_MS : TRANSITION_DURATION_MS; const ratio = Math.min(1, this.transitionElapsedMs / durationMs); context.fillStyle = `rgba(78,61,49,${0.38 * Math.sin(ratio * Math.PI)})`; context.fillRect(0, 0, viewport.width, viewport.height); }
    if (this.clearJournalElapsedMs !== null) paintPageBurn(context, viewport.width, viewport.height, Math.min(1, this.clearJournalElapsedMs / BURN_DURATION_MS), this.clearBurnGeometry, 104729);
    if (this.notice && this.notice.until > this.platform.nowMilliseconds()) { context.save(); context.fillStyle = 'rgba(73,88,83,.82)'; context.font = "13px ui-rounded,'PingFang SC',sans-serif"; context.textAlign = 'center'; context.fillText(this.notice.text, viewport.width / 2, viewport.height - safe.bottom - 34); context.restore(); } else if (this.notice) this.notice = null;
  }

  getTestSnapshot() {
    return { ready: this.ready, phase: this.burning.phase, page: this.page, inputActive: this.inputActive, patternId: this.patternId, persisted: structuredClone(this.persisted), clearJournalActive: this.clearJournalElapsedMs !== null };
  }
}
