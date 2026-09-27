import {
  HapticImpactLevel,
  NormalizedTouchPoint,
  OffscreenCanvasSurface,
  PlatformAdapter,
  PrimaryCanvas,
  TouchPhase,
} from './platform';
import {
  BEDTIME_WALLET_FLAP_MOTION_PROFILE,
  DAYTIME_WALLET_FLAP_MOTION_PROFILE,
  WALLET_FLAP_OPEN_THRESHOLD,
  WalletFlapEffect,
  WalletFlapMotionProfile,
  advanceWalletFlap,
  createInitialWalletFlapState,
} from './wallet/flap-state';
import {
  Point2D,
  clampToUnitInterval,
  isPointInsideFlapHitArea,
  isPointInsideOpenFlapHitArea,
  walletFlapRotationDegrees,
} from './wallet/flap-hit-test';
import {
  BEDTIME_CASH_DRAW_MOTION_PROFILE,
  CASH_BILL_LOGICAL_HEIGHT,
  CASH_DRAW_GESTURE_SLOP_DISTANCE,
  CashDrawEffect,
  CashDrawMotionProfile,
  DAYTIME_CASH_DRAW_MOTION_PROFILE,
  advanceCashDrawSession,
  createInitialCashDrawState,
  isPointInsideCashGrabArea,
} from './cash/draw-judgment';
import { allocateDenominationForDrawIndex, getCashDenominationById } from './cash/denomination';
import {
  AmountOdometerState,
  advanceAmountOdometer,
  createAmountOdometerState,
  enqueueAmountOdometerTarget,
} from './cash/odometer';
import {
  PERSISTED_STATE_STORAGE_KEY,
  PersistedGameStateV1,
  createInitialPersistedGameState,
  createInitialSessionProgress,
  parsePersistedGameState,
  serializePersistedGameState,
} from './meta/game-state';
import { recordDenominationFirstDraw, getGalleryEntries } from './meta/gallery';
import { ACHIEVEMENT_COLLECTION, evaluateAchievements } from './meta/achievements';
import {
  SKIN_COLLECTION,
  evaluateSkinUnlocks,
  isSkinUnlocked,
  switchActiveSkin,
} from './meta/skins';
import {
  setBgmEnabled as setBgmEnabledSetting,
  setHapticsEnabled as setHapticsEnabledSetting,
  setSoundEnabled as setSoundEnabledSetting,
  setBedtimeModeEnabled,
} from './meta/settings';
import {
  resolvePresentationDecision,
  resolveSessionHapticTier,
} from './sleep/presentation-gate';
import {
  SLEEP_NIGHT_BASE_BRIGHTNESS,
  SleepArcState,
  advanceSleepArc,
  createInitialSleepArcState,
} from './sleep/sleep-arc';
import {
  appendNightlySleepRecord,
  sealBedtimeSession as buildBedtimeSealRecord,
} from './sleep/ledger';
import {
  DrawerStage,
  OverlayLayout,
  computeMorningCardLayout,
  computeOverlayLayout,
  overlayPageDataCacheKey,
  resolveOverlayHit,
} from './meta/overlay-layout';
import {
  DRAWER_PANEL_SHADOW_BLEED_PIXELS,
  FloatingToastView,
  OverlayPageData,
  TOAST_TOTAL_DURATION_MS,
  drawDrawerPanelLayerArt,
  paintFloatingToasts,
  paintMetaOverlay,
  paintMorningCard,
} from './render/overlay-painter';
import { AudioEngine } from './audio/engine';
import {
  createSceneBackgroundGradient,
  interpolateSceneBackgroundColorAtElapsed,
  paintSceneBackgroundWithGradient,
} from './render/background-painter';
import { computeSceneLayout } from './render/scene-layout';
import { resolveWalletLeatherPalette } from './render/skin-palettes';
import {
  projectFlapPointAtParameter,
  resolveFlapStandingAngleDegrees,
} from './render/flap-projection';
import { INK_TEXT_COLOR_HEX, resolveSceneBrightness } from './render/design-tokens';
import { paintNightDimOverlay } from './render/night-dim-painter';
import {
  FlapFaceSurfaces,
  drawFlapBackFaceArt,
  drawFlapFrontFaceArt,
  paintWalletScene,
} from './render/wallet-painter';
import { billRectAtDrawRatio } from './render/bill-geometry';
import { FlyingBillView, paintActiveBill, paintFlyingBill } from './render/bill-painter';
import { paintAmountOdometer } from './render/odometer-painter';

/**
 * 游戏编排器：把钱包状态机、抽钞判定、金额里程表、元进程、音频与触觉
 * 接成一个固定时间步的主循环（120Hz 逻辑 / 每帧渲染）。
 */

/** follow-through 飘落时长（ms） */
const BILL_COMPLETING_DURATION_MS = 480;

/** 回弹收回时长（ms） */
const BILL_RECYCLING_DURATION_MS = 260;

/** 排队中的轻提示开场时刻哨兵：轮到队首时才赋实际时刻（queue-floating-toasts） */
const TOAST_QUEUED_STARTED_AT_MS = -1;

/** 连抽计数的间隔窗口（ms）：超过则重新起算 */
const STREAK_WINDOW_MS = 2500;

/** follow-through 飘落时长与行程（减弱动态时用短时长快速淡出） */
const FLYING_BILL_DURATION_MS = 850;
const FLYING_BILL_REDUCED_DURATION_MS = 220;
const FLYING_BILL_RISE_PIXELS = 74;
const FLYING_BILL_ALPHA_CUTOFF = 0.02;

/** 里程碑蜜金闪色时长（ms） */
const MILESTONE_FLASH_DURATION_MS = 600;

/** 过阈值松手后纸币继续抽出的动画时长（ms） */
const BILL_AUTO_DRAW_ANIMATION_MS = 320;

/** 元进程抽屉开合动画时长（ms）：进=缓出、出=缓入（meta-side-drawer 设计 D2） */
const DRAWER_OPEN_DURATION_MS = 180;
const DRAWER_CLOSE_DURATION_MS = 140;

/** 抽屉右滑收回的定向阈值（px）：滑动只是触发信号（与翻盖同一手势语言），不跟手 */
const DRAWER_SWIPE_CLOSE_SLOP_PX = 24;

export interface GameDependencies {
  platformAdapter: PlatformAdapter;
}

/** 缓出三次：抽出/收回动画的减速曲线 */
function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

/** epoch 毫秒 → 本地日期 ISO 字符串（yyyy-mm-dd，睡眠账本按日展示；Date 为 JS 标准非平台 API） */
function toLocalIsoDateString(epochMs: number): string {
  const localDate = new Date(epochMs);
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${localDate.getFullYear()}-${month}-${day}`;
}

/** 缓入三次：抽屉滑出的加速离开曲线 */
function easeInCubic(progress: number): number {
  return Math.pow(progress, 3);
}

export class Game {
  private readonly platformAdapter: PlatformAdapter;
  private readonly audioEngine: AudioEngine;
  private primaryCanvas: PrimaryCanvas | null = null;
  /** 元进程抽屉会话（null=关闭）：stage=菜单/页面，phase=开合动画相位，progress 由时钟推算 */
  private drawerSession: {
    stage: DrawerStage;
    phase: 'opening' | 'open' | 'closing';
    phaseStartedAtMs: number;
    /** 进入 closing 时刻的开合进度（从当前进度续滑，避免视觉跳变） */
    progressAtCloseStart: number;
  } | null = null;
  /** 最近一帧构建的抽屉布局（命中解析与绘制同源） */
  private currentOverlayLayout: OverlayLayout | null = null;
  /** 抽屉打开期间的触点起点（右滑收回的定向判定；end 或抽屉关闭即丢弃） */
  private overlaySwipeStart: {
    pointerId: number;
    positionX: number;
    positionY: number;
  } | null = null;
  /** 非侵入轻提示队列（自动淡出；queue-floating-toasts：队首计时逐个出场） */
  private floatingToasts: FloatingToastView[] = [];
  private lastFrameTimestampMs = 0;

  private flapState = createInitialWalletFlapState();
  private cashSession = createInitialCashDrawState();
  private cashAnimationStartedAtMs = 0;
  /** 松手时刻的抽出比例（完成/回收动画的起点） */
  private cashAnimationStartRatio = 0;
  /** 渲染用抽出比例：拖拽=跟手；完成=自动抽满；回收=收回归零 */
  private activeBillRenderRatio = 0;
  private activeDenominationId = 'denomination-1';
  private sessionProgress = createInitialSessionProgress();
  private odometerState: AmountOdometerState = createAmountOdometerState(0);
  private persistedState: PersistedGameStateV1 = createInitialPersistedGameState();

  private backgroundElapsedSeconds = 0;
  private breathingElapsedSeconds = 0;
  private flyingBills: FlyingBillView[] = [];
  private milestoneFlashElapsedMs = Number.POSITIVE_INFINITY;
  private streakCount = 0;
  private lastDrawCompletedAtMs = 0;

  private gestureKind: 'flap' | 'bill' | 'bill-candidate' | null = null;
  private candidateFlapHit = false;
  private activePointerId: number | null = null;
  private lastPointerPosition: Point2D | null = null;
  private lastPointerTimestampMs = 0;
  private pointerSpeedPixelsPerSecond = 0;
  private reducedMotionEnabled = false;
  /** 晚安会话是否进行中（sleep-mode 规格；由设置开关与时间窗建议驱动） */
  private bedtimeSessionActive = false;
  /** 睡眠弧线状态（晚安会话期间的熄灭时序；会话外为 null） */
  private sleepArcState: SleepArcState | null = null;
  /** 晚安会话进入时刻（epoch ms；null=未在会话） */
  private bedtimeSessionStartedAtMs: number | null = null;
  /** 进入晚安模式时的会话进度快照（封存增量基准，里程表显示延续不清零） */
  private bedtimeSessionEntryProgress = createInitialSessionProgress();
  /** 本夜是否已封存（幂等：熄灭封存后主动退出不重复记账） */
  private bedtimeSessionSealed = false;
  /** 熄灭弧线目标亮度系数（1=夜间基准；由 sleep-arc 推进） */
  private sleepArcBrightness = SLEEP_NIGHT_BASE_BRIGHTNESS;
  /** 熄灭弧线显示亮度（向目标缓动，恢复时数秒级温和过渡不骤变） */
  private displayedSleepArcBrightness = SLEEP_NIGHT_BASE_BRIGHTNESS;
  /** 早安卡呈现中（sleep-mode：封存后的下一次冷启动/回前台一次性呈现） */
  private morningCardVisible = false;
  /** 夜间时间窗建议轻提示（22:00-05:00 冷启动一次，可点按进入晚安模式） */
  private bedtimeSuggestionToast: FloatingToastView | null = null;
  /** 本轮抽钞是否已播放过唯一一次抓取沙响（规格 v2.6：一抓一声） */
  private billGrabRustlePlayed = false;
  private firstDrawGuidanceDismissed = false;
  /** 背景渐变缓存键（量化到秒的经过时间 + 视口尺寸），消灭每帧插值与渐变分配 */
  private backgroundCacheKey = '';
  private backgroundGradientCache: CanvasGradient | null = null;
  /** 抽屉布局用的皮肤 id 列表（静态集合，模块常量的投影，避免每帧 map 分配） */
  private readonly overlaySkinIdList = SKIN_COLLECTION.map((skinDefinition) => skinDefinition.id);
  /** 抽屉页面数据缓存（键覆盖 stage/图鉴/皮肤/成就/设置；动画帧上零重建零分配） */
  private overlayPageDataCache: { key: string; data: OverlayPageData } | null = null;
  /** 抽屉面板+投影缓存层（按面板尺寸重建；动画帧一次 drawImage 合成，像素与慢路径一致） */
  private drawerPanelLayerCache: {
    surface: OffscreenCanvasSurface;
    builtForWidth: number;
    builtForHeight: number;
  } | null = null;
  /** 翻盖面部纹理缓存（正/背面离屏，按钱包尺寸+皮肤重建；离屏能力不可用则恒为 null） */
  private flapFaceSurfaceCache: {
    surfaces: FlapFaceSurfaces;
    builtForWidth: number;
    builtForHeight: number;
    builtForSkinId: string;
  } | null = null;


  constructor(dependencies: GameDependencies) {
    this.platformAdapter = dependencies.platformAdapter;
    this.audioEngine = new AudioEngine({
      createAudioContext: () => this.platformAdapter.createAudioContext(),
    });
  }

  start(): void {
    this.primaryCanvas = this.platformAdapter.createPrimaryCanvas();
    this.reducedMotionEnabled = this.platformAdapter.prefersReducedMotion();

    // 冷启动：恢复元进程（抽取进度会话化——金额/张数从零开始）
    const parsedPersisted = parsePersistedGameState(
      this.platformAdapter.readPersistentValue(PERSISTED_STATE_STORAGE_KEY),
    );
    this.persistedState = parsedPersisted.state;
    this.firstDrawGuidanceDismissed = Object.keys(this.persistedState.gallery).length > 0;

    this.audioEngine.setSoundEnabled(this.persistedState.settings.soundEnabled);
    // 冷启动同步 BGM 设置到引擎（避免引擎内部默认 true 绕过用户设置自行起播）
    this.audioEngine.setBgmEnabled(this.persistedState.settings.bgmEnabled);
    // 晚安模式开关持久化（sleep-mode 规格）：开启下冷启动仍处于夜间剖面，
    // 夜间会话计数从零开始（会话数据不落盘）
    if (this.persistedState.settings.bedtimeModeEnabled) {
      this.enterBedtimeSession(this.platformAdapter.nowMilliseconds());
    }
    // 封存记录待呈现 → 早安卡一次性呈现（熄灭封存才触发）
    this.tryPresentMorningCard();
    // 夜间时间窗建议：22:00-05:00 冷启动且未处于晚安模式 → 一次可忽略轻提示
    this.maybeQueueBedtimeSuggestion();
    // 冷启动即尝试启用音频并起播 BGM（boot-wallet-autoplay-bgm）：
    // 平台允许无手势自动播放时立即出声；要求手势时 resume 失败静默降级，首触后再起播
    this.tryUnlockAudio();

    this.platformAdapter.onTouch((phase, point) => this.handleTouch(phase, point));
    this.platformAdapter.onAppVisibilityChange((visible) => {
      this.audioEngine.handleAppVisibilityChange(visible);
      if (visible) {
        // 回前台：待呈现早安卡补呈现；熄灭态下恢复熄灭音量方向（BGM 重启会把增益拉回夜间基准，需重新压向底板）
        this.tryPresentMorningCard();
        if (this.bedtimeSessionActive && this.sleepArcState && this.sleepArcState.phase !== 'idle') {
          this.audioEngine.beginSleepDimFadeOut();
        }
      } else {
        this.persistMetaProgress();
      }
    });
    this.platformAdapter.onAudioInterruption((phase) =>
      this.audioEngine.handleAudioInterruption(phase),
    );

    this.lastFrameTimestampMs = 0;
    this.platformAdapter.requestFrame((timestampMs) => this.frameLoop(timestampMs));
  }

  private handleTouch(phase: TouchPhase, point: NormalizedTouchPoint): void {
    const viewport = this.platformAdapter.getLogicalViewportSize();
    const layout = computeSceneLayout(
      viewport.width,
      viewport.height,
      this.platformAdapter.getSafeAreaInsets(),
    );
    const nowMs = this.platformAdapter.nowMilliseconds();

    if (phase === 'start') {
      // 早安卡呈现中：全部触摸只路由到卡片（点「开始新的一天」关闭，其余忽略）
      if (this.morningCardVisible) {
        const morningCardLayout = computeMorningCardLayout(viewport.width, viewport.height);
        const dismissRect = morningCardLayout.dismissButtonRect;
        if (
          point.positionX >= dismissRect.left &&
          point.positionX <= dismissRect.left + dismissRect.width &&
          point.positionY >= dismissRect.top &&
          point.positionY <= dismissRect.top + dismissRect.height
        ) {
          this.dismissMorningCard();
        }
        return;
      }
      // 抽屉打开：主场景手势无条件短路（含开抽屉后首帧布局尚未构建的窗口——
      // 布局为 null 时触摸作废而非落回主场景路由，审查实测曾放过抽钞计数）
      if (this.drawerSession !== null) {
        if (this.currentOverlayLayout) {
          this.handleOverlayTouch(point.positionX, point.positionY);
        }
        this.overlaySwipeStart = {
          pointerId: point.pointerId,
          positionX: point.positionX,
          positionY: point.positionY,
        };
        return;
      }
      // 多指防护：同一时刻只跟踪一个活跃手势，其他手指的按下/移动全部忽略（防串扰）
      if (this.activePointerId !== null) return;
      this.activePointerId = point.pointerId;
      this.tryUnlockAudio();
      const touchPoint: Point2D = { x: point.positionX, y: point.positionY };
      // 夜间时间窗建议命中：点按进入晚安模式（建议热区与轻提示绘制锚点同源：topY-76 起绘制）
      if (this.bedtimeSuggestionToast !== null) {
        const suggestionHit =
          Math.abs(point.positionX - viewport.width / 2) <= viewport.width * 0.42 &&
          point.positionY >= layout.odometerAnchor.topY - 80 &&
          point.positionY <= layout.odometerAnchor.topY - 40;
        if (suggestionHit) {
          this.bedtimeSuggestionToast = null;
          this.enterBedtimeSession(nowMs);
          return;
        }
      }
      // 晚安会话唤醒：任意触摸恢复基准亮度与音频并重置熄灭计时（不退出晚安模式）
      this.noteBedtimeInteraction(nowMs);
      // 元进程入口（右上角汉堡图标）：唤出抽屉菜单首屏
      const metaEntryDistance = Math.hypot(
        point.positionX - layout.metaEntryAnchor.centerX,
        point.positionY - layout.metaEntryAnchor.centerY,
      );
      if (metaEntryDistance <= 26) {
        this.drawerSession = {
          stage: 'menu',
          phase: 'opening',
          phaseStartedAtMs: nowMs,
          progressAtCloseStart: 1,
        };
        return;
      }
      const walletOpen = this.flapState.openProgress >= WALLET_FLAP_OPEN_THRESHOLD;
      const flapHit = isPointInsideFlapHitArea(touchPoint, layout.walletRect) ||
        (walletOpen && isPointInsideOpenFlapHitArea(
          touchPoint,
          layout.walletRect,
          Math.abs(projectFlapPointAtParameter(
            1,
            walletFlapRotationDegrees(this.flapState.openProgress),
            layout.walletFoldLineY - layout.walletRect.top,
            layout.walletRect.width,
          ).offsetFromHingePixels),
        ));
      // 纸币与扩边区域都要等到明确上拖后才开始抓取；轻点不抽钞。
      const cashGrabAllowed =
        walletOpen &&
        this.cashSession.phase !== 'dragging' &&
        isPointInsideCashGrabArea(touchPoint, layout.walletMouthRect);
      this.candidateFlapHit = false;
      if (cashGrabAllowed) {
        this.gestureKind = 'bill-candidate';
        this.candidateFlapHit = flapHit;
      } else if (flapHit) {
        this.beginFlapPress();
      }
      this.lastPointerPosition = { x: point.positionX, y: point.positionY };
      this.lastPointerTimestampMs = nowMs;
      return;
    }

    if (phase === 'move') {
      // 抽屉右滑收回：定向滑动过阈值即触发关闭（信号语义，不跟手平移抽屉）
      const swipeStart = this.overlaySwipeStart;
      if (this.drawerSession !== null && swipeStart && swipeStart.pointerId === point.pointerId) {
        const deltaRightPixels = point.positionX - swipeStart.positionX;
        const deltaVerticalPixels = Math.abs(point.positionY - swipeStart.positionY);
        if (deltaRightPixels >= DRAWER_SWIPE_CLOSE_SLOP_PX && deltaRightPixels >= deltaVerticalPixels) {
          this.beginDrawerClose();
          this.overlaySwipeStart = null;
        }
      }
      if (point.pointerId !== this.activePointerId) return;
      if (!this.lastPointerPosition || this.gestureKind === null) return;
      if (this.gestureKind === 'bill-candidate') {
        const pendingUpPixels = this.lastPointerPosition.y - point.positionY;
        const pendingHorizontalPixels = Math.abs(point.positionX - this.lastPointerPosition.x);
        const cashIntentPixels = Math.max(
          CASH_DRAW_GESTURE_SLOP_DISTANCE,
          (CASH_DRAW_GESTURE_SLOP_DISTANCE / CASH_BILL_LOGICAL_HEIGHT) *
            layout.activeBillHeight,
        );
        if (pendingUpPixels >= cashIntentPixels &&
          pendingUpPixels >= pendingHorizontalPixels) {
          this.beginBillGrab();
        } else if (this.candidateFlapHit &&
          -pendingUpPixels >= CASH_DRAW_GESTURE_SLOP_DISTANCE &&
          -pendingUpPixels >= pendingHorizontalPixels) {
          this.beginFlapPress();
        } else {
          return; // 保留按下位置，跨过阈值后一次消费全部位移
        }
      }
      const deltaYUpPixels = -(point.positionY - this.lastPointerPosition.y);
      const deltaMs = Math.max(1, nowMs - this.lastPointerTimestampMs);
      const instantSpeed = Math.abs(deltaYUpPixels) / (deltaMs / 1000);
      this.pointerSpeedPixelsPerSecond =
        this.pointerSpeedPixelsPerSecond * 0.75 + instantSpeed * 0.25;

      if (this.gestureKind === 'flap') {
        // 触发语义：滑动只是信号（不跟手），状态机内累计定向距离并即时触发折叠
        const swipeUpdate = advanceWalletFlap(this.flapState, {
          type: 'swipe',
          deltaY: deltaYUpPixels,
        });
        this.flapState = swipeUpdate.state;
        this.consumeFlapEffects(swipeUpdate.effects);
      } else if (this.gestureKind === 'bill') {
        // 屏幕像素 → 状态机的逻辑纸币高度换算（比例语义一致）；跟手增益按会话剖面注入
        const logicalDelta =
          (deltaYUpPixels / layout.activeBillHeight) * CASH_BILL_LOGICAL_HEIGHT;
        const dragUpdate = advanceCashDrawSession(
          this.cashSession,
          {
            type: 'drag',
            dragDeltaY: logicalDelta,
          },
          this.resolveCashDrawMotionProfile(),
        );
        this.cashSession = dragUpdate.state;
        this.consumeCashEffects(dragUpdate.effects);
        // 一抓一声：仅在首次移动瞬间播放唯一一次沙响，此后拖拽全程静音（v2.6）
        if (!this.billGrabRustlePlayed) {
          this.billGrabRustlePlayed = true;
          this.audioEngine.playPaperGrabRustle(
            Math.min(1, this.pointerSpeedPixelsPerSecond / 1400),
          );
        }
      }
      this.lastPointerPosition = { x: point.positionX, y: point.positionY };
      this.lastPointerTimestampMs = nowMs;
      return;
    }

    // touch end：手势收束 + 音频解锁兜底（旧版 WebKit 以 touchend 为有效手势）
    this.overlaySwipeStart = null;
    if (point.pointerId !== this.activePointerId) return;
    if (this.gestureKind === 'bill-candidate' && this.lastPointerPosition) {
      // 最后一次位移可能只出现在抬手事件中。
      this.handleTouch('move', point);
    }
    this.activePointerId = null;
    this.tryUnlockAudio();
    if (this.gestureKind === 'flap') {
      const releaseUpdate = advanceWalletFlap(this.flapState, { type: 'release' });
      this.flapState = releaseUpdate.state;
      this.consumeFlapEffects(releaseUpdate.effects);
    } else if (this.gestureKind === 'bill') {
      const releaseUpdate = advanceCashDrawSession(this.cashSession, { type: 'release' });
      this.cashSession = releaseUpdate.state;
      this.consumeCashEffects(releaseUpdate.effects);
      this.pointerSpeedPixelsPerSecond = 0;
      if (this.cashSession.phase === 'completing' || this.cashSession.phase === 'recycling') {
        this.cashAnimationStartedAtMs = nowMs;
        this.cashAnimationStartRatio = this.cashSession.pulledOutRatio;
      }
    }
    this.gestureKind = null;
    this.candidateFlapHit = false;
    this.lastPointerPosition = null;
  }

  private beginBillGrab(): void {
    // 完成动画中再次抓取：先结算在途张（此时 activeDenominationId 仍是在途张面额，
    // 图鉴/飘落才记对张），再按结算后的累计张数为新张分配面额——顺序即正确性
    const grabUpdate = advanceCashDrawSession(this.cashSession, { type: 'grab' });
    if (grabUpdate.effects.some((effect) => effect.type === 'bill-draw-completed')) {
      this.handleBillDrawCompleted(this.platformAdapter.nowMilliseconds());
    }
    this.gestureKind = 'bill';
    this.activeDenominationId = allocateDenominationForDrawIndex(
      this.persistedState.lifetimeDrawCount,
    );
    this.cashSession = grabUpdate.state;
    this.billGrabRustlePlayed = false;
    this.consumeCashEffects(grabUpdate.effects);
  }

  private beginFlapPress(): void {
    this.gestureKind = 'flap';
    const pressUpdate = advanceWalletFlap(this.flapState, { type: 'press' });
    this.flapState = pressUpdate.state;
    this.consumeFlapEffects(pressUpdate.effects);
  }

  /** 覆盖层命中处理：菜单/页面两级导航、设置开关、皮肤选择、关闭（布局同源命中） */
  private handleOverlayTouch(positionX: number, positionY: number): void {
    const layout = this.currentOverlayLayout;
    if (!layout) return;
    const hit = resolveOverlayHit(layout, positionX, positionY);
    if (hit === 'close-overlay' || (hit !== null && hit.action === 'close')) {
      this.beginDrawerClose();
      return;
    }
    if (hit === null) return;
    switch (hit.action) {
      case 'menu-gallery':
        this.setDrawerStage('gallery');
        return;
      case 'menu-skins':
        this.setDrawerStage('skins');
        return;
      case 'menu-achievements':
        this.setDrawerStage('achievements');
        return;
      case 'menu-sleep-ledger':
        this.setDrawerStage('sleep-ledger');
        return;
      case 'menu-settings':
        this.setDrawerStage('settings');
        return;
      case 'back-to-menu':
        this.setDrawerStage('menu');
        return;
      case 'back-to-settings':
        this.setDrawerStage('settings');
        return;
      case 'open-privacy':
        this.setDrawerStage('privacy');
        return;
      case 'toggle-sound': {
        const nextEnabled = !this.persistedState.settings.soundEnabled;
        this.persistedState = setSoundEnabledSetting(this.persistedState, nextEnabled);
        this.audioEngine.setSoundEnabled(nextEnabled);
        this.persistMetaProgress();
        return;
      }
      case 'toggle-bgm': {
        const nextEnabled = !this.persistedState.settings.bgmEnabled;
        this.persistedState = setBgmEnabledSetting(this.persistedState, nextEnabled);
        this.audioEngine.setBgmEnabled(nextEnabled);
        this.persistMetaProgress();
        return;
      }
      case 'toggle-bedtime-mode': {
        const nextEnabled = !this.persistedState.settings.bedtimeModeEnabled;
        this.persistedState = setBedtimeModeEnabled(this.persistedState, nextEnabled);
        if (nextEnabled) {
          this.enterBedtimeSession(this.platformAdapter.nowMilliseconds());
        } else {
          this.exitBedtimeSession(this.platformAdapter.nowMilliseconds());
        }
        this.persistMetaProgress();
        return;
      }
      case 'toggle-haptics': {
        const nextEnabled = !this.persistedState.settings.hapticsEnabled;
        this.persistedState = setHapticsEnabledSetting(this.persistedState, nextEnabled);
        this.persistMetaProgress();
        return;
      }
      case 'select-skin': {
        if (hit.skinId) {
          this.persistedState = switchActiveSkin(this.persistedState, hit.skinId);
          this.persistMetaProgress();
        }
        return;
      }
    }
  }

  /** 抽屉内切换阶段（菜单 ↔ 页面；开合相位不受影响） */
  private setDrawerStage(stage: DrawerStage): void {
    if (this.drawerSession) {
      this.drawerSession.stage = stage;
    }
  }

  /** 开始滑出关闭：从当前进度续滑，避免视觉跳变 */
  private beginDrawerClose(): void {
    const session = this.drawerSession;
    if (!session || session.phase === 'closing') return;
    session.progressAtCloseStart = this.drawerOpenProgress();
    session.phaseStartedAtMs = this.platformAdapter.nowMilliseconds();
    session.phase = 'closing';
  }

  /** 推进抽屉开合相位：opening 到点转 open；closing 到点清空会话（帧循环驱动） */
  private advanceDrawerSession(): void {
    const session = this.drawerSession;
    if (!session) return;
    const elapsedMs = this.platformAdapter.nowMilliseconds() - session.phaseStartedAtMs;
    if (session.phase === 'opening' && elapsedMs >= DRAWER_OPEN_DURATION_MS) {
      session.phase = 'open';
    }
    if (session.phase === 'closing' && elapsedMs >= DRAWER_CLOSE_DURATION_MS) {
      this.drawerSession = null;
      this.currentOverlayLayout = null;
      this.overlaySwipeStart = null;
    }
  }

  /** 当前抽屉开合进度（0~1）：进=缓出、出=从关闭起点缓入滑离 */
  private drawerOpenProgress(): number {
    const session = this.drawerSession;
    if (!session) return 0;
    const elapsedMs = this.platformAdapter.nowMilliseconds() - session.phaseStartedAtMs;
    if (session.phase === 'opening') {
      return easeOutCubic(Math.min(1, elapsedMs / DRAWER_OPEN_DURATION_MS));
    }
    if (session.phase === 'closing') {
      const closeProgress = Math.min(1, elapsedMs / DRAWER_CLOSE_DURATION_MS);
      return session.progressAtCloseStart * (1 - easeInCubic(closeProgress));
    }
    return 1;
  }

  /** 首次（及中断后的下一次）手势解锁音频，并按设置恢复 BGM（幂等：已在播则跳过） */
  private tryUnlockAudio(): void {
    if (this.audioEngine.isUnlocked() && !this.audioEngine.isReunlockRequired()) return;
    void this.audioEngine.unlock().then((unlocked) => {
      if (
        unlocked &&
        this.persistedState.settings.bgmEnabled &&
        !this.audioEngine.isPlayingBgm()
      ) {
        this.audioEngine.startBgm();
      }
    });
  }

  /** 入队轻提示：队列为空立即开场，否则排队等队首离场（一个一个显示，不同屏叠出） */
  private enqueueFloatingToast(text: string): void {
    const startsImmediately = this.floatingToasts.length === 0;
    this.floatingToasts.push({
      text,
      startedAtMs: startsImmediately
        ? this.platformAdapter.nowMilliseconds()
        : TOAST_QUEUED_STARTED_AT_MS,
    });
  }

  private consumeFlapEffects(effects: WalletFlapEffect[]): void {
    for (const effect of effects) {
      if (effect.type === 'fold-started' && effect.direction === 'open') {
        this.triggerHaptic('light');
      }
      if (effect.type === 'fold-contact') {
        // 关闭触面瞬间：闷轻拍音 + 轻触觉（真实钱包「合有拍」）
        this.audioEngine.playWalletClack('close');
        this.triggerHaptic('light');
      }
    }
  }

  private consumeCashEffects(effects: CashDrawEffect[]): void {
    // bill-follow-through-began / bill-draw-completed 均由 stepFixed 的动画时序处理
    void effects;
  }

  // ===== 晚安会话（sleep-mode 规格）：进入/退出/封存/唤醒/早安卡/时间窗建议 =====

  /** 当前翻盖运动剖面：晚安会话用夜间剖面（更慢更粘），日间保持现值 */
  private resolveFlapMotionProfile(): WalletFlapMotionProfile {
    return this.bedtimeSessionActive
      ? BEDTIME_WALLET_FLAP_MOTION_PROFILE
      : DAYTIME_WALLET_FLAP_MOTION_PROFILE;
  }

  /** 当前抽钞运动剖面：晚安会话 0.75 增益（更粘），日间完全跟手 */
  private resolveCashDrawMotionProfile(): CashDrawMotionProfile {
    return this.bedtimeSessionActive
      ? BEDTIME_CASH_DRAW_MOTION_PROFILE
      : DAYTIME_CASH_DRAW_MOTION_PROFILE;
  }

  /** 进入晚安会话：夜间剖面 + 音频睡眠编排 + 熄灭弧线起算；里程表显示延续 */
  private enterBedtimeSession(nowMs: number): void {
    if (this.bedtimeSessionActive) return;
    this.bedtimeSessionActive = true;
    this.bedtimeSessionStartedAtMs = nowMs;
    this.bedtimeSessionEntryProgress = { ...this.sessionProgress };
    this.bedtimeSessionSealed = false;
    this.sleepArcState = createInitialSleepArcState(nowMs);
    this.sleepArcBrightness = SLEEP_NIGHT_BASE_BRIGHTNESS;
    this.displayedSleepArcBrightness = SLEEP_NIGHT_BASE_BRIGHTNESS;
    this.audioEngine.setBedtimeAudioProfile(true);
  }

  /** 退出晚安会话：未封存则按主动退出封存（无入睡点、不触发早安卡），恢复日间剖面 */
  private exitBedtimeSession(nowMs: number): void {
    if (!this.bedtimeSessionActive) return;
    this.sealCurrentBedtimeSession(null, nowMs);
    this.bedtimeSessionActive = false;
    this.bedtimeSessionStartedAtMs = null;
    this.sleepArcState = null;
    this.sleepArcBrightness = SLEEP_NIGHT_BASE_BRIGHTNESS;
    this.displayedSleepArcBrightness = SLEEP_NIGHT_BASE_BRIGHTNESS;
    this.audioEngine.setBedtimeAudioProfile(false);
    // 熄灭态下退出：音频随亮度恢复（若曾在熄灭中）
    this.audioEngine.recoverFromSleepDimFade();
  }

  /** 封存本夜（幂等）：增量 = 当前会话进度 − 进入时快照；入睡点为空即主动退出变体 */
  private sealCurrentBedtimeSession(sleepPointMs: number | null, nowMs: number): void {
    if (!this.bedtimeSessionActive || this.bedtimeSessionSealed) return;
    if (this.bedtimeSessionStartedAtMs === null) return;
    const sealResult = buildBedtimeSealRecord({
      startedAtMs: this.bedtimeSessionStartedAtMs,
      sessionProgressAtEntry: this.bedtimeSessionEntryProgress,
      sessionProgressAtExit: this.sessionProgress,
      sleepPointMs,
      localDateString: toLocalIsoDateString(nowMs),
    });
    this.persistedState = {
      ...this.persistedState,
      sleepLedger: appendNightlySleepRecord(
        this.persistedState.sleepLedger ?? [],
        sealResult.record,
      ),
      pendingMorningCardRecordId: sealResult.morningCardPending
        ? sealResult.record.recordId
        : (this.persistedState.pendingMorningCardRecordId ?? null),
    };
    this.bedtimeSessionSealed = true;
    this.persistMetaProgress();
  }

  /** 晚安会话内的交互/唤醒触摸：恢复基准亮度与音频、重置熄灭计时（不退出会话） */
  private noteBedtimeInteraction(nowMs: number): void {
    if (!this.bedtimeSessionActive || !this.sleepArcState) return;
    const wasDimming = this.sleepArcState.phase !== 'idle';
    const wakeUpdate = advanceSleepArc(this.sleepArcState, { type: 'interaction', nowMs });
    this.sleepArcState = wakeUpdate.state;
    this.sleepArcBrightness = wakeUpdate.brightness;
    if (wasDimming) {
      this.audioEngine.recoverFromSleepDimFade();
    }
  }

  /** 早安卡补呈现：待呈现记录存在即显示（冷启动/回前台一次性） */
  private tryPresentMorningCard(): void {
    if (this.morningCardVisible) return;
    const pendingRecordId = this.persistedState.pendingMorningCardRecordId;
    if (!pendingRecordId) return;
    const pendingRecord = (this.persistedState.sleepLedger ?? []).find(
      (record) => record.recordId === pendingRecordId,
    );
    if (!pendingRecord) {
      // 待呈现记录已不存在（损坏清账本等）：清掉悬空标记
      this.persistedState = { ...this.persistedState, pendingMorningCardRecordId: null };
      this.persistMetaProgress();
      return;
    }
    this.morningCardVisible = true;
  }

  /** 关闭早安卡：清待呈现标记并持久化（同记录不再重复呈现） */
  private dismissMorningCard(): void {
    this.morningCardVisible = false;
    this.persistedState = { ...this.persistedState, pendingMorningCardRecordId: null };
    this.persistMetaProgress();
  }

  /** 夜间时间窗建议（22:00-05:00 冷启动一次；点按进入晚安模式） */
  private maybeQueueBedtimeSuggestion(): void {
    if (this.bedtimeSessionActive || this.bedtimeSuggestionToast !== null) return;
    const localHour = new Date().getHours();
    if (localHour >= 22 || localHour < 5) {
      this.bedtimeSuggestionToast = {
        text: '睡不着？点按试试「晚安模式」',
        startedAtMs: this.platformAdapter.nowMilliseconds(),
      };
    }
  }

  private triggerHaptic(level: HapticImpactLevel): void {
    if (this.persistedState.settings.hapticsEnabled) {
      // 晚安会话触觉降为最轻档（sleep-mode「夜间交互剖面」）
      this.platformAdapter.triggerHapticImpact(
        resolveSessionHapticTier(level, this.bedtimeSessionActive),
      );
    }
  }

  private frameLoop(timestampMs: number): void {
    if (this.lastFrameTimestampMs === 0) {
      this.lastFrameTimestampMs = timestampMs;
    }
    const deltaMs = Math.min(50, timestampMs - this.lastFrameTimestampMs);
    this.lastFrameTimestampMs = timestampMs;

    this.stepPerFrame(deltaMs);
    this.render();

    this.platformAdapter.requestFrame((nextTimestampMs) => this.frameLoop(nextTimestampMs));
  }

  /** 每帧逻辑：抽屉开合相位/折叠时间线/抽钞动画计时/里程表/呼吸/背景/飘落/闪色/BGM 前瞻/睡眠弧线 */
  private stepPerFrame(deltaMs: number): void {
    this.advanceDrawerSession();

    // 睡眠弧线推进（sleep-mode 规格）：单调时钟推算熄灭/渐暗；跨阈值跳变可补判（锁屏恢复）；
    // 进入渐暗即启动音频同步淡出；首次到达近黑 = 入睡点，封存本夜（幂等）
    if (this.bedtimeSessionActive && this.sleepArcState) {
      const sleepNowMs = this.platformAdapter.nowMilliseconds();
      const previousPhase = this.sleepArcState.phase;
      const sleepUpdate = advanceSleepArc(this.sleepArcState, {
        type: 'advance',
        nowMs: sleepNowMs,
      });
      this.sleepArcState = sleepUpdate.state;
      this.sleepArcBrightness = sleepUpdate.brightness;
      if (previousPhase === 'idle' && sleepUpdate.state.phase === 'dimming') {
        this.audioEngine.beginSleepDimFadeOut();
      }
      if (sleepUpdate.reachedSleepPoint) {
        this.sealCurrentBedtimeSession(sleepNowMs, sleepNowMs);
      }
      // 显示亮度向目标缓动（数秒级温和过渡；熄灭渐变期弧线本身线性、缓动不改变单调性）
      this.displayedSleepArcBrightness +=
        (this.sleepArcBrightness - this.displayedSleepArcBrightness) *
        Math.min(1, deltaMs / 2500);
    }

    // 时间窗建议到期离场（自动淡出后不再命中）
    if (
      this.bedtimeSuggestionToast &&
      this.platformAdapter.nowMilliseconds() - this.bedtimeSuggestionToast.startedAtMs >
        TOAST_TOTAL_DURATION_MS
    ) {
      this.bedtimeSuggestionToast = null;
    }

    // 翻盖自主折叠时间线推进（缓入缓出，状态机内完成转向/收敛判定；剖面按会话注入）
    this.flapState = advanceWalletFlap(
      this.flapState,
      {
        type: 'advance',
        deltaMs,
      },
      this.resolveFlapMotionProfile(),
    ).state;

    // 抽钞完成/回收动画到时结算（完成路径触发计数与元进程结算）
    const nowMs = this.platformAdapter.nowMilliseconds();
    if (
      this.cashSession.phase === 'completing' &&
      nowMs - this.cashAnimationStartedAtMs >= BILL_COMPLETING_DURATION_MS
    ) {
      const finishedUpdate = advanceCashDrawSession(this.cashSession, {
        type: 'animation-finished',
      });
      this.cashSession = finishedUpdate.state;
      this.consumeCashEffects(finishedUpdate.effects);
      if (finishedUpdate.effects.some((effect) => effect.type === 'bill-draw-completed')) {
        this.handleBillDrawCompleted(nowMs);
      }
    } else if (
      this.cashSession.phase === 'recycling' &&
      nowMs - this.cashAnimationStartedAtMs >= BILL_RECYCLING_DURATION_MS
    ) {
      const finishedUpdate = advanceCashDrawSession(this.cashSession, {
        type: 'animation-finished',
      });
      this.cashSession = finishedUpdate.state;
      this.consumeCashEffects(finishedUpdate.effects);
    }
    this.odometerState = advanceAmountOdometer(this.odometerState, deltaMs);
    if (!this.reducedMotionEnabled) {
      this.backgroundElapsedSeconds += deltaMs / 1000;
      this.breathingElapsedSeconds += deltaMs / 1000;
    }
    this.milestoneFlashElapsedMs += deltaMs;

    const flyingDurationMs = this.reducedMotionEnabled
      ? FLYING_BILL_REDUCED_DURATION_MS
      : FLYING_BILL_DURATION_MS;
    this.flyingBills = this.flyingBills.filter(
      (flyingBill) => flyingBill.alpha > FLYING_BILL_ALPHA_CUTOFF,
    );
    for (const flyingBill of this.flyingBills) {
      flyingBill.y -= (deltaMs / flyingDurationMs) * FLYING_BILL_RISE_PIXELS;
      flyingBill.alpha = Math.max(0, flyingBill.alpha - deltaMs / flyingDurationMs);
    }

    this.audioEngine.updateBgm();

    // 轻提示队列推进：队首到总时长即离场，下一条立即开场（未开场的保持排队不计时）
    const toastNowMs = this.platformAdapter.nowMilliseconds();
    const activeToast = this.floatingToasts[0];
    if (
      activeToast &&
      activeToast.startedAtMs !== TOAST_QUEUED_STARTED_AT_MS &&
      toastNowMs - activeToast.startedAtMs >= TOAST_TOTAL_DURATION_MS
    ) {
      this.floatingToasts.shift();
      const nextToast = this.floatingToasts[0];
      if (nextToast && nextToast.startedAtMs === TOAST_QUEUED_STARTED_AT_MS) {
        nextToast.startedAtMs = toastNowMs;
      }
    }

    // 纸币渲染比例：拖拽、过阈值完成及回收的动画曲线
    const cashAnimationElapsedMs =
      this.platformAdapter.nowMilliseconds() - this.cashAnimationStartedAtMs;
    if (this.cashSession.phase === 'dragging') {
      this.activeBillRenderRatio = this.cashSession.pulledOutRatio;
    } else if (this.cashSession.phase === 'completing') {
      const drawOutProgress = easeOutCubic(
        clampToUnitInterval(cashAnimationElapsedMs / BILL_AUTO_DRAW_ANIMATION_MS),
      );
      this.activeBillRenderRatio =
        this.cashAnimationStartRatio + (1 - this.cashAnimationStartRatio) * drawOutProgress;
    } else if (this.cashSession.phase === 'recycling') {
      const recycleProgress = easeOutCubic(
        clampToUnitInterval(cashAnimationElapsedMs / BILL_RECYCLING_DURATION_MS),
      );
      this.activeBillRenderRatio = this.cashAnimationStartRatio * (1 - recycleProgress);
    } else {
      this.activeBillRenderRatio = 0;
    }
  }

  /** 一张纸币完成抽出：会话累计 + 元进程评估 + 音画触反馈（核心闭环） */
  private handleBillDrawCompleted(nowMs: number): void {
    const denomination = getCashDenominationById(this.activeDenominationId);
    const faceValue = denomination?.faceValue ?? 1;

    // 会话进度（会话化：不落盘）
    this.sessionProgress.sessionAmount += faceValue;
    this.sessionProgress.sessionCount += 1;
    this.odometerState = enqueueAmountOdometerTarget(
      this.odometerState,
      this.sessionProgress.sessionAmount,
    );

    // 元进程（跨会话持久化）
    this.persistedState.lifetimeDrawCount += 1;
    const galleryRecord = recordDenominationFirstDraw(
      this.persistedState,
      this.activeDenominationId,
      this.persistedState.lifetimeDrawCount - 1,
    );
    this.persistedState = galleryRecord.state;
    if (galleryRecord.isFirstDraw) {
      this.firstDrawGuidanceDismissed = true;
    }
    const skinUnlockEvaluation = evaluateSkinUnlocks(this.persistedState);
    this.persistedState = skinUnlockEvaluation.state;
    for (const unlockedSkin of skinUnlockEvaluation.newlyUnlocked) {
      // 夜间解锁提示全静默（判定照常写入；呈现门控，sleep-mode 规格）
      if (
        resolvePresentationDecision('skin-unlock-toast', this.bedtimeSessionActive, 'light')
          .present
      ) {
        this.enqueueFloatingToast(`解锁皮肤 · ${unlockedSkin.displayName}`);
      }
    }
    const achievementEvaluation = evaluateAchievements(this.persistedState);
    this.persistedState = achievementEvaluation.state;
    for (const achievementId of achievementEvaluation.newlyAchieved) {
      const achievementDefinition = ACHIEVEMENT_COLLECTION.find(
        (definition) => definition.id === achievementId,
      );
      if (
        achievementDefinition &&
        resolvePresentationDecision('achievement-toast', this.bedtimeSessionActive, 'light')
          .present
      ) {
        this.enqueueFloatingToast(`成就达成 · ${achievementDefinition.displayName}`);
      }
    }
    this.persistMetaProgress();

    this.spawnFlyingBill();

    // 连抽与里程碑（每 100 张：捆扎 tok + 强化触觉 + 闪色 + streak 回落）
    if (nowMs - this.lastDrawCompletedAtMs <= STREAK_WINDOW_MS) {
      this.streakCount += 1;
    } else {
      this.streakCount = 1;
    }
    this.lastDrawCompletedAtMs = nowMs;
    this.triggerHaptic('light');

    if (this.sessionProgress.sessionCount % 100 === 0) {
      // 里程碑庆祝（动效+音效+触觉）夜间全静默，判定照常（sleep-mode 规格）
      if (
        resolvePresentationDecision('milestone-celebration', this.bedtimeSessionActive, 'medium')
          .present
      ) {
        this.audioEngine.playMilestoneTok();
        this.triggerHaptic('medium');
        this.milestoneFlashElapsedMs = 0;
      }
      this.streakCount = 0;
    }
  }

  /** follow-through 飘落纸币：在抽出完成时刻生成于完整抽出位置 */
  private spawnFlyingBill(): void {
    const viewport = this.platformAdapter.getLogicalViewportSize();
    const layout = computeSceneLayout(
      viewport.width,
      viewport.height,
      this.platformAdapter.getSafeAreaInsets(),
    );
    const fullyDrawnRect = billRectAtDrawRatio(layout.walletRect, layout.walletFoldLineY, 1);
    this.flyingBills.push({
      x: fullyDrawnRect.left + fullyDrawnRect.width / 2,
      y: fullyDrawnRect.top + fullyDrawnRect.height / 2,
      rotationDegrees: (Math.random() * 2 - 1) * 8,
      alpha: 1,
      width: fullyDrawnRect.width,
      height: fullyDrawnRect.height,
      denominationId: this.activeDenominationId,
      billSkinId: this.persistedState.activeBillSkin ?? undefined,
    });
    if (this.flyingBills.length > 12) {
      this.flyingBills.shift();
    }
  }

  private persistMetaProgress(): void {
    this.platformAdapter.writePersistentValue(
      PERSISTED_STATE_STORAGE_KEY,
      serializePersistedGameState(this.persistedState),
    );
  }

  /** 冒烟测试诊断快照（仅供无头回归入口读取，不参与玩法逻辑） */
  getSmokeTestSnapshot(): {
    walletOpen: boolean;
    flapPhase: string;
    flapOpenProgress: number;
    cashPhase: string;
    sessionCount: number;
    sessionAmount: number;
    odometerTargetTotal: number;
    persistedLifetimeDrawCount: number;
    drawerOpen: boolean;
    drawerStage: string | null;
    audioUnlocked: boolean;
    bgmPlaying: boolean;
    /** sleep-mode（bedtime-money-counting）：夜间会话/弧线/封存/早安卡冒烟字段 */
    bedtimeSessionActive: boolean;
    sleepArcPhase: string | null;
    sleepLedgerNightCount: number;
    morningCardPending: boolean;
    morningCardVisible: boolean;
  } {
    return {
      walletOpen: this.flapState.phase === 'open',
      flapPhase: this.flapState.phase,
      flapOpenProgress: this.flapState.openProgress,
      cashPhase: this.cashSession.phase,
      sessionCount: this.sessionProgress.sessionCount,
      sessionAmount: this.sessionProgress.sessionAmount,
      odometerTargetTotal: this.odometerState.targetTotal,
      persistedLifetimeDrawCount: this.persistedState.lifetimeDrawCount,
      drawerOpen: this.drawerSession !== null,
      drawerStage: this.drawerSession?.stage ?? null,
      audioUnlocked: this.audioEngine.isUnlocked(),
      bgmPlaying: this.audioEngine.isPlayingBgm(),
      bedtimeSessionActive: this.bedtimeSessionActive,
      sleepArcPhase: this.sleepArcState?.phase ?? null,
      sleepLedgerNightCount: (this.persistedState.sleepLedger ?? []).length,
      morningCardPending: this.persistedState.pendingMorningCardRecordId !== null &&
        this.persistedState.pendingMorningCardRecordId !== undefined,
      morningCardVisible: this.morningCardVisible,
    };
  }

  private ensureFlapFaceSurfaces(
    faceWidth: number,
    faceHeight: number,
    skinId: string,
  ): FlapFaceSurfaces | null {
    if (
      this.flapFaceSurfaceCache &&
      this.flapFaceSurfaceCache.builtForWidth === faceWidth &&
      this.flapFaceSurfaceCache.builtForHeight === faceHeight &&
      this.flapFaceSurfaceCache.builtForSkinId === skinId
    ) {
      return this.flapFaceSurfaceCache.surfaces;
    }
    const leatherColors = resolveWalletLeatherPalette(skinId);
    // 纹理按主画布渲染尺度（DPR）建缓存：1× 纹理经 drawImage 放大是翻盖边缘
    // 模糊+台阶的来源（实测反馈「糊糊的锯齿」）；逻辑坐标系不变，仅像素密度提升
    const renderScale = this.readPrimaryCanvasRenderScale();
    const frontSurface: OffscreenCanvasSurface | null = this.platformAdapter.createOffscreenCanvas(
      Math.round(faceWidth * renderScale),
      Math.round(faceHeight * renderScale),
    );
    const backSurface: OffscreenCanvasSurface | null = this.platformAdapter.createOffscreenCanvas(
      Math.round(faceWidth * renderScale),
      Math.round(faceHeight * renderScale),
    );
    if (!frontSurface || !backSurface) {
      this.flapFaceSurfaceCache = null;
      return null;
    }
    for (const surface of [frontSurface, backSurface]) {
      surface.renderingContext.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    }
    drawFlapFrontFaceArt(frontSurface.renderingContext, faceWidth, faceHeight, leatherColors);
    drawFlapBackFaceArt(backSurface.renderingContext, faceWidth, faceHeight, leatherColors);
    this.flapFaceSurfaceCache = {
      surfaces: { front: frontSurface, back: backSurface },
      builtForWidth: faceWidth,
      builtForHeight: faceHeight,
      builtForSkinId: skinId,
    };
    return this.flapFaceSurfaceCache.surfaces;
  }

  /** 主画布当前渲染尺度（ctx 变换矩阵 a 分量 = DPR）；无头/能力缺失环境回退 1 */
  private readPrimaryCanvasRenderScale(): number {
    const contextTransform = this.primaryCanvas?.renderingContext.getTransform?.();
    const scaleX = contextTransform?.a ?? 1;
    return Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1;
  }

  /** 抽屉面板+投影缓存层：面板尺寸不变则复用；离屏能力不可用返回 null（走原样式慢路径） */
  private ensureDrawerPanelLayer(panelWidth: number, panelHeight: number): OffscreenCanvasSurface | null {
    if (
      this.drawerPanelLayerCache &&
      this.drawerPanelLayerCache.builtForWidth === panelWidth &&
      this.drawerPanelLayerCache.builtForHeight === panelHeight
    ) {
      return this.drawerPanelLayerCache.surface;
    }
    const bleed = DRAWER_PANEL_SHADOW_BLEED_PIXELS;
    const layerLogicalWidth = panelWidth + bleed * 2;
    const layerLogicalHeight = panelHeight + bleed * 2;
    const renderScale = this.readPrimaryCanvasRenderScale();
    const surface = this.platformAdapter.createOffscreenCanvas(
      Math.round(layerLogicalWidth * renderScale),
      Math.round(layerLogicalHeight * renderScale),
    );
    if (!surface) {
      this.drawerPanelLayerCache = null;
      return null;
    }
    surface.renderingContext.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    drawDrawerPanelLayerArt(surface.renderingContext, layerLogicalWidth, layerLogicalHeight);
    this.drawerPanelLayerCache = {
      surface,
      builtForWidth: panelWidth,
      builtForHeight: panelHeight,
    };
    return surface;
  }

  private render(): void {
    const canvas = this.primaryCanvas;
    if (!canvas) return;
    const renderingContext = canvas.renderingContext;
    const viewport = this.platformAdapter.getLogicalViewportSize();
    const safeArea = this.platformAdapter.getSafeAreaInsets();

    const layout = computeSceneLayout(viewport.width, viewport.height, safeArea);

    // 背景（减弱动态：冻结在首色板）。渐变按「量化到秒的色板 + 视口尺寸」缓存，
    // 驻留期零重建，交叉过渡期每秒至多重建一次——满足「静态视觉层缓存策略」而非每帧重绘。
    const backgroundCacheKey = `${Math.floor(
      this.reducedMotionEnabled ? 0 : this.backgroundElapsedSeconds,
    )}|${viewport.width}|${viewport.height}`;
    if (backgroundCacheKey !== this.backgroundCacheKey || !this.backgroundGradientCache) {
      const backgroundColorPair = interpolateSceneBackgroundColorAtElapsed(
        this.reducedMotionEnabled ? 0 : Math.floor(this.backgroundElapsedSeconds),
      );
      this.backgroundGradientCache = createSceneBackgroundGradient(
        renderingContext,
        viewport.width,
        viewport.height,
        backgroundColorPair,
      );
      this.backgroundCacheKey = backgroundCacheKey;
    }
    paintSceneBackgroundWithGradient(
      renderingContext,
      viewport.width,
      viewport.height,
      this.backgroundGradientCache,
    );

    // 钱包（呼吸 ≤0.4% 幅度；减弱动态时恒为 1）
    const breathingScale = this.reducedMotionEnabled
      ? 1
      : 1 + 0.004 * Math.sin((Math.PI * 2 * this.breathingElapsedSeconds) / 4);
    // 直立角自适应：150°~180° 段按可用净空重映射（小屏微后仰，不遮金额里程表）
    const flapLengthPixels = layout.walletFoldLineY - layout.walletRect.top;
    const counterBottomY = layout.odometerAnchor.topY + 64;
    const standingMaxAngleDegrees = resolveFlapStandingAngleDegrees(
      layout.walletRect.top - counterBottomY - 8,
      flapLengthPixels,
    );
    let flapRotationDegrees = walletFlapRotationDegrees(this.flapState.openProgress);
    if (flapRotationDegrees > 150) {
      flapRotationDegrees =
        150 + (flapRotationDegrees - 150) * ((standingMaxAngleDegrees - 150) / 30);
    }
    paintWalletScene(renderingContext, {
      walletRect: layout.walletRect,
      foldLineY: layout.walletFoldLineY,
      flapRotationDegrees,
      breathingScale,
      hideTopStackLayer: this.cashSession.phase !== 'idle',
      topBillDenominationId: allocateDenominationForDrawIndex(
        this.persistedState.lifetimeDrawCount,
      ),
      followingBillDenominationId: allocateDenominationForDrawIndex(
        this.persistedState.lifetimeDrawCount + 1,
      ),
      flapFaceSurfaces: this.ensureFlapFaceSurfaces(
        layout.walletRect.width,
        layout.walletFoldLineY - layout.walletRect.top,
        this.persistedState.activeWalletSkin,
      ),
      walletLeatherPalette: resolveWalletLeatherPalette(this.persistedState.activeWalletSkin),
      activeSkinId: this.persistedState.activeBillSkin ?? undefined,
    });

    // 纸币：拖拽跟手 / 过阈值完成时自动抽满 / 回收时收回归零
    if (this.cashSession.phase !== 'idle') {
      paintActiveBill(renderingContext, {
        billRect: billRectAtDrawRatio(
          layout.walletRect, layout.walletFoldLineY, this.activeBillRenderRatio,
        ),
        foldLineY: layout.walletFoldLineY,
        dragVelocityPixelsPerSecond: this.pointerSpeedPixelsPerSecond,
        denominationId: this.activeDenominationId,
        billSkinId: this.persistedState.activeBillSkin ?? undefined,
      });
    }

    // follow-through 飘落纸币
    for (const flyingBill of this.flyingBills) {
      paintFlyingBill(renderingContext, flyingBill);
    }

    // 金额里程表（唯一主指标；里程碑瞬时蜜金闪色）
    paintAmountOdometer(renderingContext, this.odometerState, {
      centerX: layout.odometerAnchor.centerX,
      topY: layout.odometerAnchor.topY,
      fontSize: Math.min(56, Math.round(viewport.width * 0.13)),
      milestoneFlashRatio:
        this.milestoneFlashElapsedMs < MILESTONE_FLASH_DURATION_MS
          ? 1 - this.milestoneFlashElapsedMs / MILESTONE_FLASH_DURATION_MS
          : 0,
    });

    // 首次抽取引导（一次性，规格：完成首次抽取后不再出现；
    // hints-above-odometer：锚点从钱包口上方移到里程表正上方，避开物理纸币堆叠）
    if (
      this.flapState.openProgress > 0.8 &&
      !this.firstDrawGuidanceDismissed &&
      this.cashSession.phase === 'idle'
    ) {
      renderingContext.save();
      // 实测反馈：深色静态显示，不做动态闪烁
      renderingContext.globalAlpha = 0.9;
      renderingContext.fillStyle = INK_TEXT_COLOR_HEX;
      renderingContext.font = "15px 'PingFang SC', sans-serif";
      renderingContext.textAlign = 'center';
      renderingContext.textBaseline = 'middle';
      // 实测反馈：教学引导放在钱包翻盖的中央（铰链在钱包顶边，投影参数 0.5=盖面中点，
      // 负偏移=开盖态盖面在顶边上方，引导随开合角度始终贴在盖面中央）
      const flapCenterProjection = projectFlapPointAtParameter(
        0.5,
        flapRotationDegrees,
        flapLengthPixels,
        layout.walletRect.width,
      );
      renderingContext.fillText(
        '向上轻拖，抽出现金',
        viewport.width / 2,
        layout.walletRect.top + flapCenterProjection.offsetFromHingePixels,
      );
      renderingContext.restore();
    }

    // 元进程入口（右上角汉堡形轻量图标；meta-side-drawer：替换旧圆圈+圆点）
    renderingContext.save();
    renderingContext.globalAlpha = 0.7;
    renderingContext.strokeStyle = INK_TEXT_COLOR_HEX;
    renderingContext.lineWidth = 2;
    renderingContext.lineCap = 'round';
    const entryCenterX = layout.metaEntryAnchor.centerX;
    const entryCenterY = layout.metaEntryAnchor.centerY;
    for (let lineOffset = -1; lineOffset <= 1; lineOffset += 1) {
      renderingContext.beginPath();
      renderingContext.moveTo(entryCenterX - 11, entryCenterY + lineOffset * 6);
      renderingContext.lineTo(entryCenterX + 11, entryCenterY + lineOffset * 6);
      renderingContext.stroke();
    }
    renderingContext.restore();

    // 元进程抽屉（图鉴/皮肤/成就/设置/隐私；布局与命中同源，动画进度喂入布局）
    if (this.drawerSession !== null) {
      const overlayLayout = computeOverlayLayout(
        this.drawerSession.stage,
        viewport.width,
        viewport.height,
        safeArea,
        this.overlaySkinIdList,
        this.drawerOpenProgress(),
      );
      this.currentOverlayLayout = overlayLayout;
      // 页面数据按内容签名缓存（动画帧零分配；内容变化源见 overlayPageDataCacheKey）
      const overlayPageDataCacheKeyForFrame = overlayPageDataCacheKey(
        this.persistedState,
        this.drawerSession.stage,
      );
      let overlayPageData = this.overlayPageDataCache?.key === overlayPageDataCacheKeyForFrame
        ? this.overlayPageDataCache.data
        : null;
      if (!overlayPageData) {
        overlayPageData = {
        galleryEntries: getGalleryEntries(this.persistedState),
        skins: SKIN_COLLECTION.map((skinDefinition) => ({
          definition: skinDefinition,
          unlocked: isSkinUnlocked(this.persistedState, skinDefinition.id),
          active:
            skinDefinition.kind === 'wallet'
              ? this.persistedState.activeWalletSkin === skinDefinition.id
              : this.persistedState.activeBillSkin === skinDefinition.id,
        })),
        achievements: ACHIEVEMENT_COLLECTION.map((achievementDefinition) => ({
          definition: achievementDefinition,
          achieved: this.persistedState.achievements.includes(achievementDefinition.id),
        })),
          settings: this.persistedState.settings,
          sleepLedger: this.persistedState.sleepLedger ?? [],
        };
        this.overlayPageDataCache = { key: overlayPageDataCacheKeyForFrame, data: overlayPageData };
      }
      paintMetaOverlay(
        renderingContext,
        overlayLayout,
        overlayPageData,
        this.ensureDrawerPanelLayer(overlayLayout.panelRect.width, overlayLayout.panelRect.height),
      );
    } else {
      this.currentOverlayLayout = null;
    }

    // 非侵入轻提示（最上层，自动淡出、不阻断交互）。
    // 抽屉打开（含开合动画）期间不绘制——不遮挡菜单页面；关闭后未过期的继续淡出。
    // hints-above-odometer：锚点移到里程表正上方，多条向上堆叠
    const startedFloatingToasts = this.floatingToasts.filter(
      (toast) => toast.startedAtMs !== TOAST_QUEUED_STARTED_AT_MS,
    );
    if (startedFloatingToasts.length > 0 && this.drawerSession === null) {
      paintFloatingToasts(
        renderingContext,
        startedFloatingToasts,
        this.platformAdapter.nowMilliseconds(),
        layout.odometerAnchor.topY - 36,
        viewport.width,
      );
    }

    // 夜间视觉基调与渐进熄灭（sleep-mode 规格）：全画面统一暖黑叠层乘算亮度。
    // 各画师输出零改动；日间（亮度恒 1）不加叠层，渲染输出与既有完全一致。
    const sceneBrightness = resolveSceneBrightness(
      this.bedtimeSessionActive,
      this.displayedSleepArcBrightness,
    );
    paintNightDimOverlay(renderingContext, viewport.width, viewport.height, sceneBrightness);

    // 时间窗建议轻提示（提示队列之下独立锚点；自动淡出、点按进入晚安模式）
    if (this.bedtimeSuggestionToast && this.drawerSession === null) {
      paintFloatingToasts(
        renderingContext,
        [this.bedtimeSuggestionToast],
        this.platformAdapter.nowMilliseconds(),
        layout.odometerAnchor.topY - 76,
        viewport.width,
      );
    }

    // 早安卡（sleep-mode 规格）：熄灭封存后一次性呈现，绘制于熄灭叠层之上保持可读
    if (this.morningCardVisible) {
      const pendingRecordId = this.persistedState.pendingMorningCardRecordId;
      const pendingRecord = (this.persistedState.sleepLedger ?? []).find(
        (record) => record.recordId === pendingRecordId,
      );
      if (pendingRecord) {
        paintMorningCard(
          renderingContext,
          computeMorningCardLayout(viewport.width, viewport.height),
          pendingRecord,
        );
      }
    }
  }
}
