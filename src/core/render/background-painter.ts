import { blendCssColor } from '../utility/color-utilities';
import { SCENE_BACKGROUND_PALETTES } from './design-tokens';

/**
 * 背景色板漂移（game-visuals 规格：2-3 组预设色板分钟级缓慢漂移渐变）。
 * 周期结构：每 180s 一个相位——前 150s 驻留当前色板，后 30s 平滑过渡到下一组。
 * 减弱动态效果时由调用方冻结 elapsed（不推进即静止）。
 */

/** 单个色板相位总时长（秒） */
export const BACKGROUND_DRIFT_PHASE_SECONDS = 180;

/** 相位末尾的交叉过渡时长（秒） */
export const BACKGROUND_DRIFT_CROSSFADE_SECONDS = 30;

export interface SceneBackgroundColorPair {
  topColorCss: string;
  bottomColorCss: string;
}

/** 由经过时间推导当前背景色对（纯函数：确定性、可单测；色板取自设计令牌） */
export function interpolateSceneBackgroundColorAtElapsed(
  elapsedSeconds: number,
): SceneBackgroundColorPair {
  const palettes = SCENE_BACKGROUND_PALETTES;
  const paletteCount = palettes.length;
  const cycleSeconds = BACKGROUND_DRIFT_PHASE_SECONDS * paletteCount;
  const clampedElapsed = ((elapsedSeconds % cycleSeconds) + cycleSeconds) % cycleSeconds;

  const phaseIndex = Math.floor(clampedElapsed / BACKGROUND_DRIFT_PHASE_SECONDS);
  const phaseElapsed = clampedElapsed % BACKGROUND_DRIFT_PHASE_SECONDS;
  const currentPalette = palettes[phaseIndex];
  const nextPalette = palettes[(phaseIndex + 1) % paletteCount];

  // 前 150s 驻留，后 30s 缓慢交叉过渡（缓入缓出）
  const crossfadeProgress =
    phaseElapsed <= BACKGROUND_DRIFT_PHASE_SECONDS - BACKGROUND_DRIFT_CROSSFADE_SECONDS
      ? 0
      : (phaseElapsed - (BACKGROUND_DRIFT_PHASE_SECONDS - BACKGROUND_DRIFT_CROSSFADE_SECONDS)) /
        BACKGROUND_DRIFT_CROSSFADE_SECONDS;
  const easedProgress = crossfadeProgress * crossfadeProgress * (3 - 2 * crossfadeProgress);

  return {
    topColorCss: blendCssColor(currentPalette.topColorHex, nextPalette.topColorHex, easedProgress),
    bottomColorCss: blendCssColor(
      currentPalette.bottomColorHex,
      nextPalette.bottomColorHex,
      easedProgress,
    ),
  };
}

/** 构建背景渐变（垂直渐变：光从上方来）；调用方缓存渐变对象以避免每帧分配 */
export function createSceneBackgroundGradient(
  renderingContext: CanvasRenderingContext2D,
  viewportWidth: number,
  viewportHeight: number,
  backgroundColorPair: SceneBackgroundColorPair,
): CanvasGradient {
  const gradient = renderingContext.createLinearGradient(0, 0, viewportWidth * 0.25, viewportHeight);
  gradient.addColorStop(0, backgroundColorPair.topColorCss);
  gradient.addColorStop(1, backgroundColorPair.bottomColorCss);
  return gradient;
}

/** 以已缓存的渐变填充全屏背景 */
export function paintSceneBackgroundWithGradient(
  renderingContext: CanvasRenderingContext2D,
  viewportWidth: number,
  viewportHeight: number,
  backgroundGradient: CanvasGradient,
): void {
  renderingContext.fillStyle = backgroundGradient;
  renderingContext.fillRect(0, 0, viewportWidth, viewportHeight);
}
