import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type {
  HapticImpactLevel,
  LogicalViewportSize,
  NormalizedTouchPoint,
  PlatformAdapter,
  PrimaryCanvas,
  SafeAreaInsets,
  TouchPhase,
} from '../core/platform';

/**
 * Web / Capacitor(WKWebView) 平台适配器。
 *
 * 说明：本文件是平台能力的合法出口（import-audit 只审计 src/core），
 * 未来迁移微信小游戏时新增 wx 适配器，内核零改动。
 */

/** 触觉三档 → navigator.vibrate 时长（ms）；iOS Web 上通常无效，由 Capacitor Haptics 增强 */
const HAPTIC_VIBRATION_DURATION_MS: Record<HapticImpactLevel, number> = {
  light: 8,
  medium: 14,
  heavy: 22,
};

/** 读取安全区 CSS 变量（index.html 中以 env() 注入到 :root） */
function readSafeAreaCssVariable(variableName: string): number {
  const rawValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();
  const parsedValue = Number.parseFloat(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

/** 渲染缩放上限：封顶 3 防超高 DPI 无限填充；下限 1 防异常值 */
const MAX_RENDER_SCALE = 3;

/**
 * 主画布渲染缩放解析（lift-render-dpr-cap）：
 * 3x 设备须获得原生分辨率 backing store——曾锁 2 导致合成器 ×1.5 拉伸、
 * 全图圆角出现 1~3 级锯齿台阶（实测反馈），已放开到设备原生值（封顶 3）。
 */
export function resolveRenderScale(devicePixelRatio: number): number {
  return Math.max(1, Math.min(devicePixelRatio, MAX_RENDER_SCALE));
}

export function createWebPlatformAdapter(): PlatformAdapter {
  let cachedCanvas: PrimaryCanvas | null = null;
  const touchListeners = new Set<(phase: TouchPhase, point: NormalizedTouchPoint) => void>();
  const audioInterruptionListeners = new Set<(phase: 'begin' | 'end') => void>();
  const visibilityListeners = new Set<(visible: boolean) => void>();

  function emitTouch(phase: TouchPhase, domEvent: PointerEvent): void {
    const canvasRect = (domEvent.target as HTMLElement).getBoundingClientRect();
    const normalizedPoint: NormalizedTouchPoint = {
      positionX: domEvent.clientX - canvasRect.left,
      positionY: domEvent.clientY - canvasRect.top,
      pointerId: domEvent.pointerId,
    };
    for (const listener of touchListeners) listener(phase, normalizedPoint);
  }

  function setupTouchForwarding(canvasElement: HTMLCanvasElement): void {
    canvasElement.addEventListener('pointerdown', (domEvent) => {
      domEvent.preventDefault();
      emitTouch('start', domEvent);
    });
    canvasElement.addEventListener('pointermove', (domEvent) => {
      emitTouch('move', domEvent);
    });
    const emitEnd = (domEvent: PointerEvent) => emitTouch('end', domEvent);
    canvasElement.addEventListener('pointerup', emitEnd);
    canvasElement.addEventListener('pointercancel', emitEnd);
  }

  return {
    createPrimaryCanvas(): PrimaryCanvas {
      if (cachedCanvas) return cachedCanvas;

      const canvasElement = document.createElement('canvas');
      canvasElement.style.position = 'fixed';
      canvasElement.style.inset = '0';
      canvasElement.style.width = '100%';
      canvasElement.style.height = '100%';
      canvasElement.style.touchAction = 'none';
      document.body.appendChild(canvasElement);

      const renderingContext = canvasElement.getContext('2d');
      if (!renderingContext) {
        throw new Error('当前环境不支持 Canvas 2D');
      }

      /** backing store 跟随设备 DPR（上限 3，见 resolveRenderScale）——保圆角抗锯齿 */
      const syncCanvasSize = () => {
        const devicePixelRatio = resolveRenderScale(window.devicePixelRatio || 1);
        const logicalWidth = window.innerWidth;
        const logicalHeight = window.innerHeight;
        canvasElement.width = Math.round(logicalWidth * devicePixelRatio);
        canvasElement.height = Math.round(logicalHeight * devicePixelRatio);
        renderingContext.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        // 渲染尺度诊断日志：本类锯齿问题的第一手证据（DPR/逻辑尺寸/backing store）
        console.info(
          `[render] dpr=${window.devicePixelRatio} scale=${devicePixelRatio} logical=${logicalWidth}x${logicalHeight} backing=${canvasElement.width}x${canvasElement.height}`,
        );
      };
      syncCanvasSize();
      window.addEventListener('resize', syncCanvasSize);

      setupTouchForwarding(canvasElement);
      cachedCanvas = {
        renderingContext,
        get logicalWidth() {
          return window.innerWidth;
        },
        get logicalHeight() {
          return window.innerHeight;
        },
      };
      return cachedCanvas;
    },

    requestFrame(callback) {
      return window.requestAnimationFrame(callback);
    },

    onTouch(listener) {
      touchListeners.add(listener);
    },

    createAudioContext() {
      try {
        const audioContextConstructor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        return audioContextConstructor ? new audioContextConstructor() : null;
      } catch {
        return null;
      }
    },

    onAudioInterruption(listener) {
      audioInterruptionListeners.add(listener);
    },

    triggerHapticImpact(level) {
      // Capacitor 壳内走原生 Haptics（三档 impact）；Web 环境回落 navigator.vibrate
      const impactStyleByLevel = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      } as const;
      void Haptics.impact({ style: impactStyleByLevel[level] }).catch(() => {
        try {
          navigator.vibrate?.(HAPTIC_VIBRATION_DURATION_MS[level]);
        } catch {
          // 静默降级（规格：触觉不可用不报错）
        }
      });
    },

    readPersistentValue(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },

    writePersistentValue(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // 静默降级：存储失败时会话内继续运行（规格场景）
      }
    },

    getSafeAreaInsets(): SafeAreaInsets {
      return {
        top: readSafeAreaCssVariable('--safe-area-inset-top'),
        bottom: readSafeAreaCssVariable('--safe-area-inset-bottom'),
        left: readSafeAreaCssVariable('--safe-area-inset-left'),
        right: readSafeAreaCssVariable('--safe-area-inset-right'),
      };
    },

    getLogicalViewportSize(): LogicalViewportSize {
      return { width: window.innerWidth, height: window.innerHeight };
    },

    onAppVisibilityChange(listener) {
      if (visibilityListeners.size === 0) {
        document.addEventListener('visibilitychange', () => {
          const visible = document.visibilityState === 'visible';
          if (visible) {
            for (const interruptionListener of audioInterruptionListeners) {
              interruptionListener('end');
            }
          } else {
            for (const interruptionListener of audioInterruptionListeners) {
              interruptionListener('begin');
            }
          }
          for (const visibilityListener of visibilityListeners) {
            visibilityListener(visible);
          }
        });
      }
      visibilityListeners.add(listener);
    },

    prefersReducedMotion() {
      try {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      } catch {
        return false;
      }
    },

    nowMilliseconds() {
      return performance.now();
    },

    createOffscreenCanvas(pixelWidth, pixelHeight) {
      try {
        const canvasElement = document.createElement('canvas');
        canvasElement.width = pixelWidth;
        canvasElement.height = pixelHeight;
        const renderingContext = canvasElement.getContext('2d');
        if (!renderingContext) return null;
        return {
          renderingContext,
          sourceSurface: canvasElement,
          pixelWidth,
          pixelHeight,
        };
      } catch {
        return null; // 能力不可用：调用方降级
      }
    },
  };
}
