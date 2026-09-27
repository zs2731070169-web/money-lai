/**
 * 平台适配层契约（内核访问平台能力的唯一出口）。
 *
 * 纪律（platform-adaptation 规格「平台无关内核纪律」，由 scripts/import-audit.mjs 回归）：
 * src/core 下的代码禁止直接引用 wx / @capacitor / window / document 等平台专有接口，
 * 一切平台能力（画布、帧调度、输入、音频、触觉、存储、安全区、前后台）都经由本接口进出。
 */

/** 触摸交互阶段：start=按下、move=移动、end=抬起/取消 */
export type TouchPhase = 'start' | 'move' | 'end';

/** 归一化触摸点：逻辑坐标系下与平台原始事件解耦 */
export interface NormalizedTouchPoint {
  /** 逻辑坐标 X（已扣除画布偏移，单位：逻辑像素） */
  positionX: number;
  /** 逻辑坐标 Y（单位：逻辑像素） */
  positionY: number;
  /** 触点唯一标识，用于多指追踪 */
  pointerId: number;
}

/** 触觉反馈三档（对应 iOS UIImpactFeedbackStyle / 微信 vibrateShort type） */
export type HapticImpactLevel = 'light' | 'medium' | 'heavy';

/** 安全区内边距（逻辑像素；避让刘海/灵动岛/Home 指示条） */
export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 逻辑视口尺寸（逻辑像素） */
export interface LogicalViewportSize {
  width: number;
  height: number;
}

/** 单行文本输入请求（心事输入，worry-release 规格） */
export interface TextInputRequest {
  /** 占位文案 */
  placeholder: string;
  /** 长度上限（字符） */
  maxLength: number;
}

/** 主画布：2D 上下文已按 DPR 换算，业务绘制一律使用逻辑坐标 */
export interface PrimaryCanvas {
  /** 2D 渲染上下文（transform 已按 devicePixelRatio 缩放，3x 设备锁 2x） */
  renderingContext: CanvasRenderingContext2D;
  /** 逻辑宽度（逻辑像素） */
  logicalWidth: number;
  /** 逻辑高度（逻辑像素） */
  logicalHeight: number;
}

/** 离屏画布表面（纹理/静态层缓存用；条带取样消费 sourceSurface） */
export interface OffscreenCanvasSurface {
  /** 2D 渲染上下文（坐标为像素坐标，调用方自管缩放） */
  renderingContext: CanvasRenderingContext2D;
  /** 可作为 drawImage 源的画布 */
  sourceSurface: CanvasImageSource;
  /** 像素宽度 */
  pixelWidth: number;
  /** 像素高度 */
  pixelHeight: number;
}

/** 平台适配器接口：未来迁移微信小游戏/安卓时仅需新增实现，不改内核 */
export interface PlatformAdapter {
  /** 创建（或复用）全屏主画布，并完成 DPR 缩放设置 */
  createPrimaryCanvas(): PrimaryCanvas;
  /** 请求下一帧回调，返回可取消的句柄 */
  requestFrame(callback: (timestampMilliseconds: number) => void): number;
  /** 订阅归一化触摸事件（语义化三阶段；同一 listener 只注册一次） */
  onTouch(listener: (phase: TouchPhase, point: NormalizedTouchPoint) => void): void;
  /** 创建平台音频上下文（WebAudio 兼容）；不可用时返回 null */
  createAudioContext(): AudioContext | null;
  /** 订阅音频中断事件（来电/其他 App 抢占/切后台） */
  onAudioInterruption(listener: (phase: 'begin' | 'end') => void): void;
  /** 触觉反馈（三档）；系统关闭或不支持时静默降级，MUST NOT 抛出 */
  triggerHapticImpact(level: HapticImpactLevel): void;
  /** 读取本地持久化值；键不存在或存储异常时返回 null（会话内降级） */
  readPersistentValue(key: string): string | null;
  /** 写入本地持久化值；失败静默（会话内降级），MUST NOT 抛出 */
  writePersistentValue(key: string, value: string): void;
  /** 当前安全区内边距 */
  getSafeAreaInsets(): SafeAreaInsets;
  /** 当前逻辑视口尺寸 */
  getLogicalViewportSize(): LogicalViewportSize;
  /** 订阅 App 前后台切换（visible=false 表示进入后台） */
  onAppVisibilityChange(listener: (visible: boolean) => void): void;
  /** 系统级「减弱动态效果」是否开启（动效收敛依据，game-visuals 规格） */
  prefersReducedMotion(): boolean;
  /** 单调时钟（毫秒）：手势计时/动画计时的时间源（各端实现映射到自身高精度时钟） */
  nowMilliseconds(): number;
  /** 创建离屏画布（纹理/静态层缓存）；能力不可用时返回 null（调用方降级） */
  createOffscreenCanvas(pixelWidth: number, pixelHeight: number): OffscreenCanvasSurface | null;
  /** 唤出单行文本输入：resolve 用户确认的文本、取消/关闭 resolve null。
   *  平台输入 UI（DOM/系统输入法）细节只存在于适配器实现内（worry-release 规格）；MUST NOT 抛出。 */
  presentTextInput(options: TextInputRequest): Promise<string | null>;
}
