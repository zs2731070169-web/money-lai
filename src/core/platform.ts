/** 业务内核访问平台能力的唯一出口。 */
export type TouchPhase = 'start' | 'move' | 'end';
export interface NormalizedTouchPoint { positionX: number; positionY: number; pointerId: number }
export interface SafeAreaInsets { top: number; bottom: number; left: number; right: number }
export interface LogicalViewportSize { width: number; height: number }
export interface PrimaryCanvas {
  renderingContext: CanvasRenderingContext2D;
  logicalWidth: number;
  logicalHeight: number;
}
export interface OffscreenCanvasSurface {
  renderingContext: CanvasRenderingContext2D;
  sourceSurface: CanvasImageSource;
  pixelWidth: number;
  pixelHeight: number;
}
export interface TextInputRequest { initialValue: string; placeholder: string; maxLength: number }
export interface TemporaryPngShareRequest { fileName: string; base64Data: string; title: string }
export type ShareResult = 'shared' | 'cancelled' | 'failed';

export interface PlatformAdapter {
  createPrimaryCanvas(): PrimaryCanvas;
  requestFrame(callback: (timestampMilliseconds: number) => void): number;
  onTouch(listener: (phase: TouchPhase, point: NormalizedTouchPoint) => void): void;
  createAudioContext(): AudioContext | null;
  onAudioInterruption(listener: (phase: 'begin' | 'end') => void): void;
  readPersistentValue(key: string): Promise<string | null>;
  writePersistentValue(key: string, value: string): Promise<boolean>;
  requestSingleLineText(request: TextInputRequest): Promise<string | null>;
  requestPrivacyConsent(policyUrl: string | null): Promise<boolean>;
  requestConfirmation(message: string): Promise<boolean>;
  openExternalUrl(url: string): Promise<boolean>;
  shareTemporaryPng(request: TemporaryPngShareRequest): Promise<ShareResult>;
  encodePng(surface: OffscreenCanvasSurface): Promise<string | null>;
  incrementAnonymousBurnCount(): Promise<number | null>;
  randomUnit(): number;
  getSafeAreaInsets(): SafeAreaInsets;
  getLogicalViewportSize(): LogicalViewportSize;
  onAppVisibilityChange(listener: (visible: boolean) => void): void;
  prefersReducedMotion(): boolean;
  nowMilliseconds(): number;
  createOffscreenCanvas(pixelWidth: number, pixelHeight: number): OffscreenCanvasSurface | null;
  loadBundledImage(assetUrl: string): Promise<CanvasImageSource | null>;
}
