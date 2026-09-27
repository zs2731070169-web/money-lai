import {
  HapticImpactLevel,
  NormalizedTouchPoint,
  OffscreenCanvasSurface,
  PlatformAdapter,
  PrimaryCanvas,
  TouchPhase,
} from './platform';
import {
  WALLET_FLAP_OPEN_THRESHOLD,
  WalletFlapEffect,
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
  CASH_BILL_LOGICAL_HEIGHT,
  CASH_DRAW_GESTURE_SLOP_DISTANCE,
  CashDrawEffect,
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
} from './meta/settings';
import {
  DrawerStage,
  OverlayLayout,
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
import { INK_TEXT_COLOR_HEX } from './render/design-tokens';
import {
  FlapFaceSurfaces,
  drawFlapBackFaceArt,
  drawFlapFrontFaceArt,
  paintWalletScene,
} from './render/wallet-painter';
import { billRectAtDrawRatio } from './render/bill-geometry';
import { FlyingBillView, paintActiveBill, paintFlyingBill } from './render/bill-painter';
import {
  ASCEND_DRIFT_X_MAX_PIXELS_PER_SECOND,
  ASCEND_VELOCITY_UP_PIXELS_PER_SECOND,
  advanceFlyingBills,
} from './render/flying-bills';
import { billStackBillHeight, billStackBillWidth } from './render/bill-geometry';
import { paintGraspedBillStack, paintWorryBillFace } from './render/worry-bill-painter';
import { advanceScatterSession, createInitialScatterState } from './worry/scatter-state';
import {
  WORRY_BILL_FADE_EXTRA_DELAY_SECONDS,
  WORRY_TEXT_MAX_LENGTH,
  WorryBill,
  applyWorryBillCompletion,
  isValidWorryText,
  resolveAscensionBillPlan,
} from './worry/worry-bill';
import { paintAmountOdometer } from './render/odometer-painter';

/**
 * 游戏编排器：把钱包状态机、抽钞判定、金额里程表、元进程、音频与触觉
 * 接成一个固定时间步的主循环（120Hz 逻辑 / 每帧渲染）。
 */

/** follow-through 飘落时长（ms） */
const BILL_COMPLETING_DURATION_MS = 480;
/** 心事钞 denomination id（面额例外：¥0、不入图鉴、不消耗面额分配序号） */
const WORRY_DENOMINATION_ID = 'worry-bill';
/** 长按纸堆唤出心事输入的静置时长（毫秒） */
const WORRY_INPUT_LONG_PRESS_MS = 500;
/** 长按候选位移容差（逻辑像素）：超出即视为拖动、取消候选 */
const WORRY_INPUT_PRESS_SLOP_PX = 7;
/** 放飞后轻文案的静默拍延迟（毫秒，约等于里程表滚降完成时长） */
const SCATTER_ZERO_MESSAGE_DELAY_MS = 1_100;

/** 回弹收回时长（ms） */
const BILL_RECYCLING_DURATION_MS = 260;

/** 排队中的轻提示开场时刻哨兵：轮到队首时才赋实际时刻（queue-floating-toasts） */
const TOAST_QUEUED_STARTED_AT_MS = -1;

/** 连抽计数的间隔窗口（ms）：超过则重新起算 */
const STREAK_WINDOW_MS = 2500;

/** follow-through 飘落时长与行程（减弱动态时用短时长快速淡出） */

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

/** 里程表命中区（放飞发起区）：以锚点为中心的数字带（看到的=可按的） */
function isPointInsideOdometerHitArea(
  point: Point2D,
  odometerCenterX: number,
  odometerTopY: number,
): boolean {
  return (
    Math.abs(point.x - odometerCenterX) <= 170 &&
    point.y >= odometerTopY - 12 &&
    point.y <= odometerTopY + 72
  );
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

  private gestureKind: 'flap' | 'bill' | 'bill-candidate' | 'scatter' | null = null;
  /** 放飞状态机（worry-release）：里程表凝沓跟手与松手结算 */
  private scatterState = createInitialScatterState();
  /** 心事输入长按候选：按下于纸堆且静置中（0.5s 唤出；明确拖动即取消） */
  private worryInputPressCandidate: {
    positionX: number;
    positionY: number;
    startedAtMs: number;
  } | null = null;
  /** 心事输入覆盖层在场（输入期间主循环暂停交互路由） */
  private worryInputActive = false;
  /** 待抽出的心事钞（写下即置位：下一次抓取抽出它；会话内存态绝不落盘） */
  private pendingWorryBill: WorryBill | null = null;
  /** 本次抽出中的心事钞（完成结算时消费） */
  private drawingWorryBill: WorryBill | null = null;
  /** 已抽出、等待放飞了却的心事钞清单（会话内存态，放飞即清空） */
  private carriedWorryBills: WorryBill[] = [];
  /** 凝沓纸沓跟手：目标（指尖）与显示（垂坠缓动）位置 */
  private graspedStackTargetX = 0;
  private graspedStackTargetY = 0;
  private graspedStackDisplayX = 0;
  private graspedStackDisplayY = 0;
  /** 放飞后「都过去了」轻文案的入队时刻（静默一拍，等里程表滚降完成） */
  private zeroMessagePendingAtMs: number | null = null;
  private candidateFlapHit = false;
  private activePointerId: number | null = null;
  private lastPointerPosition: Point2D | null = null;
  private lastPointerTimestampMs = 0;
  private pointerSpeedPixelsPerSecond = 0;
  private reducedMotionEnabled = false;
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
    // 冷启动即尝试启用音频并起播 BGM（boot-wallet-autoplay-bgm）：
    // 平台允许无手势自动播放时立即出声；要求手势时 resume 失败静默降级，首触后再起播
    this.tryUnlockAudio();

    this.platformAdapter.onTouch((phase, point) => this.handleTouch(phase, point));
    this.platformAdapter.onAppVisibilityChange((visible) => {
      this.audioEngine.handleAppVisibilityChange(visible);
      if (!visible) {
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
      // 心事输入覆盖层在场：输入组件接管交互，主场景路由暂停
      if (this.worryInputActive) return;
      this.activePointerId = point.pointerId;
      this.tryUnlockAudio();
      const touchPoint: Point2D = { x: point.positionX, y: point.positionY };
      // 放飞发起：按住金额里程表（会话余额 > 0 才凝沓；0 余额静默无动作）
      if (
        this.sessionProgress.sessionAmount > 0 &&
        isPointInsideOdometerHitArea(
          touchPoint,
          layout.odometerAnchor.centerX,
          layout.odometerAnchor.topY,
        )
      ) {
        const scatterUpdate = advanceScatterSession(this.scatterState, { type: 'press' });
        if (scatterUpdate.state.phase === 'grasped') {
          this.scatterState = scatterUpdate.state;
          this.gestureKind = 'scatter';
          this.graspedStackTargetX = point.positionX;
          this.graspedStackTargetY = point.positionY;
          this.graspedStackDisplayX = point.positionX;
          this.graspedStackDisplayY = point.positionY;
          this.lastPointerPosition = { x: point.positionX, y: point.positionY };
          this.lastPointerTimestampMs = nowMs;
        }
        return;
      }
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
        // 心事输入长按候选：静置 0.5s 唤出输入；明确拖动即取消（move 路径处理）
        this.worryInputPressCandidate = {
          positionX: point.positionX,
          positionY: point.positionY,
          startedAtMs: nowMs,
        };
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
      // 放飞凝沓跟手：位移进状态机累计上拖偏移；纸沓目标位置贴指尖
      if (this.gestureKind === 'scatter') {
        const scatterUpdate = advanceScatterSession(this.scatterState, {
          type: 'drag',
          deltaUpPixels: this.lastPointerPosition.y - point.positionY,
        });
        this.scatterState = scatterUpdate.state;
        this.graspedStackTargetX = point.positionX;
        this.graspedStackTargetY = point.positionY;
        this.lastPointerPosition = { x: point.positionX, y: point.positionY };
        this.lastPointerTimestampMs = nowMs;
        return;
      }
      if (this.gestureKind === 'bill-candidate') {
        // 明确拖动即取消心事输入候选（拖动=抽钞意图，长按=写下意图）
        if (
          this.worryInputPressCandidate &&
          Math.hypot(
            point.positionX - this.worryInputPressCandidate.positionX,
            point.positionY - this.worryInputPressCandidate.positionY,
          ) > WORRY_INPUT_PRESS_SLOP_PX
        ) {
          this.worryInputPressCandidate = null;
        }
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
        // 屏幕像素 → 状态机的逻辑纸币高度换算（比例语义一致）
        const logicalDelta =
          (deltaYUpPixels / layout.activeBillHeight) * CASH_BILL_LOGICAL_HEIGHT;
        const dragUpdate = advanceCashDrawSession(this.cashSession, {
          type: 'drag',
          dragDeltaY: logicalDelta,
        });
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
    if (this.gestureKind === 'scatter') {
      // 放飞松手结算：高处=放飞（升腾+归零）；原位/拖回=取消（数字恢复）
      const scatterUpdate = advanceScatterSession(this.scatterState, { type: 'release' });
      if (scatterUpdate.outcome === 'scatter-released') {
        this.performAscension(this.graspedStackDisplayX, this.graspedStackDisplayY);
      }
      this.scatterState = createInitialScatterState();
      this.gestureKind = null;
      this.lastPointerPosition = null;
      return;
    }
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
    this.worryInputPressCandidate = null;
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
    // 心事钞指定（worry-release）：写下的下一次抓取抽出心事钞——
    // ¥0 计张不计额、不入图鉴、不消耗确定性面额分配序号
    this.drawingWorryBill = this.pendingWorryBill;
    this.pendingWorryBill = null;
    this.activeDenominationId = this.drawingWorryBill
      ? WORRY_DENOMINATION_ID
      : allocateDenominationForDrawIndex(this.persistedState.lifetimeDrawCount);
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

  private triggerHaptic(level: HapticImpactLevel): void {
    if (this.persistedState.settings.hapticsEnabled) {
      this.platformAdapter.triggerHapticImpact(level);
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

  /** 每帧逻辑：抽屉开合相位/折叠时间线/抽钞动画计时/里程表/呼吸/背景/飘落/闪色/BGM 前瞻 */
  private stepPerFrame(deltaMs: number): void {
    this.advanceDrawerSession();
    // 翻盖自主折叠时间线推进（缓入缓出，状态机内完成转向/收敛判定）
    this.flapState = advanceWalletFlap(this.flapState, {
      type: 'advance',
      deltaMs,
    }).state;

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

    // 心事输入长按候选：静置约 0.5s 唤出输入（当前手势挂起，输入覆盖层接管交互）
    if (this.worryInputPressCandidate && this.gestureKind === 'bill-candidate') {
      const candidate = this.worryInputPressCandidate;
      const heldStillMs = nowMs - candidate.startedAtMs;
      const movedBeyondSlop =
        this.lastPointerPosition !== null &&
        Math.hypot(
          this.lastPointerPosition.x - candidate.positionX,
          this.lastPointerPosition.y - candidate.positionY,
        ) > WORRY_INPUT_PRESS_SLOP_PX;
      if (movedBeyondSlop) {
        this.worryInputPressCandidate = null;
      } else if (heldStillMs >= WORRY_INPUT_LONG_PRESS_MS) {
        this.worryInputPressCandidate = null;
        this.gestureKind = null;
        this.activePointerId = null;
        void this.openWorryInput();
      }
    }

    // 凝沓纸沓跟手：显示位置向指尖缓动（微垂坠滞后）
    if (this.scatterState.phase === 'grasped') {
      const swaySmoothing = Math.min(1, deltaMs / 120);
      this.graspedStackDisplayX +=
        (this.graspedStackTargetX - this.graspedStackDisplayX) * swaySmoothing;
      this.graspedStackDisplayY +=
        (this.graspedStackTargetY - this.graspedStackDisplayY) * swaySmoothing;
    }

    // 放飞归零后的静默一拍：轻文案「都过去了」入队（自动淡出，无按钮无庆祝）
    if (
      this.zeroMessagePendingAtMs !== null &&
      this.platformAdapter.nowMilliseconds() >= this.zeroMessagePendingAtMs
    ) {
      this.zeroMessagePendingAtMs = null;
      this.enqueueFloatingToast('都过去了');
    }

    // 飘落/升腾纸钞推进（纯函数：原 follow-through 行为逐字段不变，升腾为放飞扩展）
    this.flyingBills = advanceFlyingBills(this.flyingBills, deltaMs, {
      reducedMotion: this.reducedMotionEnabled,
    });

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
    // 心事钞完成抽出（worry-release 规格）：计张不计额、元进程无感——
    // 不进金额/图鉴/皮肤/成就链路，转入在场清单等待放飞了却
    if (this.drawingWorryBill) {
      const worryBill = this.drawingWorryBill;
      this.drawingWorryBill = null;
      this.sessionProgress = applyWorryBillCompletion(this.sessionProgress);
      this.carriedWorryBills.push(worryBill);
      this.spawnFlyingBill(worryBill.text);
      this.triggerHaptic('light');
      return;
    }
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
      this.enqueueFloatingToast(`解锁皮肤 · ${unlockedSkin.displayName}`);
    }
    const achievementEvaluation = evaluateAchievements(this.persistedState);
    this.persistedState = achievementEvaluation.state;
    for (const achievementId of achievementEvaluation.newlyAchieved) {
      const achievementDefinition = ACHIEVEMENT_COLLECTION.find(
        (definition) => definition.id === achievementId,
      );
      if (achievementDefinition) {
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
      this.audioEngine.playMilestoneTok();
      this.triggerHaptic('medium');
      this.milestoneFlashElapsedMs = 0;
      this.streakCount = 0;
    }
  }

  /** follow-through 飘落纸币：在抽出完成时刻生成于完整抽出位置；心事钞携带票面文本 */
  private spawnFlyingBill(worryText?: string): void {
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
      worryText,
    });
    if (this.flyingBills.length > 12) {
      this.flyingBills.shift();
    }
  }

  /** 唤出心事输入（长按纸堆 0.5s）：确认且合法 → 置位待抽心事钞；取消无痕 */
  private async openWorryInput(): Promise<void> {
    this.worryInputActive = true;
    const text = await this.platformAdapter.presentTextInput({
      placeholder: '写下一件心事，放飞即逝',
      maxLength: WORRY_TEXT_MAX_LENGTH,
    });
    this.worryInputActive = false;
    if (text !== null && isValidWorryText(text)) {
      this.pendingWorryBill = { text: text.trim() };
    }
  }

  /**
   * 放飞执行（worry-release「升腾呈现/归零收束」）：
   * 余额视觉化为升腾纸钞自松手点升腾（心事钞延时多半拍最后淡去）、
   * 放飞声部+轻触觉、里程表滚动归零、会话清零可续抽、静默一拍后轻文案。
   */
  private performAscension(releaseX: number, releaseY: number): void {
    const ascensionPlan = resolveAscensionBillPlan(
      this.sessionProgress.sessionAmount,
      this.carriedWorryBills,
    );
    const viewport = this.platformAdapter.getLogicalViewportSize();
    const layout = computeSceneLayout(
      viewport.width,
      viewport.height,
      this.platformAdapter.getSafeAreaInsets(),
    );
    const billWidth = billStackBillWidth(layout.walletRect) * 0.9;
    const billHeight = billStackBillHeight(layout.walletRect) * 0.9;
    // 普通升腾纸钞：以张序派生确定性的散布/漂移/初速（同余额重放飞观感一致），
    // 初速与漂移幅度从升腾运动快照常量派生（调参唯一落点）
    for (let billIndex = 0; billIndex < ascensionPlan.scatterBillCount; billIndex += 1) {
      this.spawnAscensionBill(
        releaseX + (((billIndex * 37) % 11) - 5) * 9,
        releaseY + (((billIndex * 23) % 7) - 3) * 8,
        (ASCEND_DRIFT_X_MAX_PIXELS_PER_SECOND * (((billIndex % 7) - 3) / 3) +
          (billIndex % 3) * 6),
        ASCEND_VELOCITY_UP_PIXELS_PER_SECOND - 40 + (billIndex % 5) * 20,
        0,
        undefined,
        billWidth,
        billHeight,
        `denomination-${[1, 5, 10, 50, 100][billIndex % 5]}`,
      );
    }
    // 心事钞：在场清单逐张升腾、延时多半拍最后淡去（票面带字）
    this.carriedWorryBills.forEach((worryBill, worryIndex) => {
      this.spawnAscensionBill(
        releaseX + (worryIndex - 0.5) * 26,
        releaseY + 6,
        (worryIndex % 2 === 0 ? -1 : 1) * 14,
        ASCEND_VELOCITY_UP_PIXELS_PER_SECOND - 30,
        WORRY_BILL_FADE_EXTRA_DELAY_SECONDS * 1000,
        worryBill.text,
        billWidth,
        billHeight,
        WORRY_DENOMINATION_ID,
      );
    });
    this.audioEngine.playAscensionVoice();
    this.triggerHaptic('light');
    // 会话清零（里程表滚动下降归零）+ 心事了却 + 静默拍轻文案
    this.sessionProgress = createInitialSessionProgress();
    this.odometerState = enqueueAmountOdometerTarget(this.odometerState, 0);
    this.carriedWorryBills = [];
    this.zeroMessagePendingAtMs =
      this.platformAdapter.nowMilliseconds() + SCATTER_ZERO_MESSAGE_DELAY_MS;
  }

  /** 生成一张升腾纸钞（放飞视觉化；worryText 在场时以心事钞票面呈现） */
  private spawnAscensionBill(
    positionX: number,
    positionY: number,
    driftXPixelsPerSecond: number,
    velocityUpPixelsPerSecond: number,
    fadeDelayMs: number,
    worryText: string | undefined,
    billWidth: number,
    billHeight: number,
    denominationId: string,
  ): void {
    this.flyingBills.push({
      x: positionX,
      y: positionY,
      rotationDegrees: (Math.random() * 2 - 1) * 10,
      alpha: 1,
      width: billWidth,
      height: billHeight,
      denominationId,
      ascend: { velocityUpPixelsPerSecond, driftXPixelsPerSecond, fadeDelayMs },
      worryText,
    });
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
    /** worry-release（bill-ascension）：放飞/心事钞冒烟字段 */
    scatterPhase: string;
    pendingWorryBillActive: boolean;
    carriedWorryBillCount: number;
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
      scatterPhase: this.scatterState.phase,
      pendingWorryBillActive: this.pendingWorryBill !== null,
      carriedWorryBillCount: this.carriedWorryBills.length,
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

    // 纸币：拖拽跟手 / 过阈值完成时自动抽满 / 回收时收回归零；
    // 心事钞在场（待抽/抽出中）以心事票面呈现（淡字→抽起清晰）
    if (this.cashSession.phase !== 'idle') {
      const activeBillRect = billRectAtDrawRatio(
        layout.walletRect, layout.walletFoldLineY, this.activeBillRenderRatio,
      );
      if (this.drawingWorryBill) {
        paintWorryBillFace(
          renderingContext,
          activeBillRect,
          this.drawingWorryBill.text,
          0.3 + 0.7 * this.activeBillRenderRatio,
        );
      } else {
        paintActiveBill(renderingContext, {
          billRect: activeBillRect,
          foldLineY: layout.walletFoldLineY,
          dragVelocityPixelsPerSecond: this.pointerSpeedPixelsPerSecond,
          denominationId: this.activeDenominationId,
          billSkinId: this.persistedState.activeBillSkin ?? undefined,
        });
      }
    } else if (this.pendingWorryBill && this.flapState.openProgress >= WALLET_FLAP_OPEN_THRESHOLD) {
      // 待抽心事钞静置堆顶：淡字票面替换堆顶（看见它，才知道可以抽它）
      paintWorryBillFace(
        renderingContext,
        billRectAtDrawRatio(layout.walletRect, layout.walletFoldLineY, 0),
        this.pendingWorryBill.text,
        0.3,
      );
    }

    // follow-through 飘落纸币 / 放飞升腾纸钞（心事钞以带字票面呈现）
    for (const flyingBill of this.flyingBills) {
      if (flyingBill.worryText) {
        renderingContext.save();
        renderingContext.globalAlpha = flyingBill.alpha;
        renderingContext.translate(flyingBill.x, flyingBill.y);
        renderingContext.rotate((flyingBill.rotationDegrees * Math.PI) / 180);
        paintWorryBillFace(
          renderingContext,
          {
            left: -flyingBill.width / 2,
            top: -flyingBill.height / 2,
            width: flyingBill.width,
            height: flyingBill.height,
          },
          flyingBill.worryText,
          1,
        );
        renderingContext.restore();
      } else {
        paintFlyingBill(renderingContext, flyingBill);
      }
    }

    // 金额里程表（唯一主指标；里程碑瞬时蜜金闪色）；
    // 凝沓跟手期间数字隐去（化作指尖纸沓），取消回落/放飞后恢复
    if (this.scatterState.phase !== 'grasped') {
      paintAmountOdometer(renderingContext, this.odometerState, {
        centerX: layout.odometerAnchor.centerX,
        topY: layout.odometerAnchor.topY,
        fontSize: Math.min(56, Math.round(viewport.width * 0.13)),
        milestoneFlashRatio:
          this.milestoneFlashElapsedMs < MILESTONE_FLASH_DURATION_MS
            ? 1 - this.milestoneFlashElapsedMs / MILESTONE_FLASH_DURATION_MS
            : 0,
      });
    } else {
      // 指尖纸沓（worry-release「亲手放飞」）：凝在指尖、微垂坠跟手
      paintGraspedBillStack(
        renderingContext,
        this.graspedStackDisplayX,
        this.graspedStackDisplayY,
        billStackBillWidth(layout.walletRect) * 0.9,
        billStackBillHeight(layout.walletRect) * 0.9,
        0,
      );
    }

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
  }
}
