import type { NormalizedTouchPoint, OffscreenCanvasSurface, PlatformAdapter, PrimaryCanvas, SafeAreaInsets, ShareResult, TextInputRequest, TouchPhase } from '../../src/core/platform';

function fakeContext(canvasShell?: { width: number }): CanvasRenderingContext2D {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(_target, property) {
      if (property === 'canvas') return canvasShell;
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (property === 'measureText') return (text: string) => ({ width: text.length * 9 });
      if (property === 'getTransform') return () => ({ a: 1 });
      return () => undefined;
    },
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
}

export class FakePlatform implements PlatformAdapter {
  now = 0;
  readonly storage = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: Array<{ key: string; value: string }> = [];
  readonly openedUrls: string[] = [];
  readonly shares: Array<{ fileName: string; base64Data: string; title: string }> = [];
  touchListener: ((phase: TouchPhase, point: NormalizedTouchPoint) => void) | null = null;
  frameCallback: ((timestamp: number) => void) | null = null;
  consent = true;
  consentRequests = 0;
  confirmation = true;
  textResult: string | null = '';
  countResult: number | null = 1;
  countCalls = 0;
  storageReadsSucceed = true;
  storageWritesSucceed = true;
  reducedMotion = false;
  randomValues = [0];
  private randomIndex = 0;
  readonly viewport = { width: 402, height: 874 };
  readonly safe: SafeAreaInsets = { top: 62, bottom: 34, left: 0, right: 0 };
  /** 主画布背衬宽度（模拟 DPR≈3），供渲染层推导设备像素比。 */
  readonly primaryCanvasShell = { width: 1206 };
  readonly context = fakeContext(this.primaryCanvasShell);
  /** 背景合成接线测试用：注入的随包位图与离屏画布分配行为。 */
  bundledImage: CanvasImageSource | null = null;
  offscreenCanvasCalls = 0;
  offscreenCanvasSucceeds = true;
  createPrimaryCanvas(): PrimaryCanvas { return { renderingContext: this.context, logicalWidth: this.viewport.width, logicalHeight: this.viewport.height }; }
  requestFrame(callback: (timestampMilliseconds: number) => void): number { this.frameCallback = callback; return 1; }
  tick(deltaMs: number): void { this.now += deltaMs; const callback = this.frameCallback; this.frameCallback = null; callback?.(this.now); }
  onTouch(listener: (phase: TouchPhase, point: NormalizedTouchPoint) => void): void { this.touchListener = listener; }
  touch(phase: TouchPhase, x: number, y: number, pointerId = 1): void { this.touchListener?.(phase, { positionX: x, positionY: y, pointerId }); }
  createAudioContext(): AudioContext | null { return null; }
  onAudioInterruption(): void {}
  async readPersistentValue(key: string): Promise<string | null> { this.reads.push(key); return this.storageReadsSucceed ? this.storage.get(key) ?? null : null; }
  async writePersistentValue(key: string, value: string): Promise<boolean> { this.writes.push({ key, value }); if (this.storageWritesSucceed) this.storage.set(key, value); return this.storageWritesSucceed; }
  async requestSingleLineText(_request: TextInputRequest): Promise<string | null> { return this.textResult; }
  async requestPrivacyConsent(): Promise<boolean> { this.consentRequests += 1; return this.consent; }
  async requestConfirmation(): Promise<boolean> { return this.confirmation; }
  async openExternalUrl(url: string): Promise<boolean> { this.openedUrls.push(url); return true; }
  async shareTemporaryPng(request: { fileName: string; base64Data: string; title: string }): Promise<ShareResult> { this.shares.push(request); return 'shared'; }
  async encodePng(): Promise<string | null> { return 'cG5n'; }
  async incrementAnonymousBurnCount(): Promise<number | null> { this.countCalls += 1; return this.countResult; }
  randomUnit(): number { const value = this.randomValues[this.randomIndex % this.randomValues.length] ?? 0; this.randomIndex += 1; return value; }
  getSafeAreaInsets(): SafeAreaInsets { return this.safe; }
  getLogicalViewportSize() { return this.viewport; }
  onAppVisibilityChange(): void {}
  prefersReducedMotion(): boolean { return this.reducedMotion; }
  nowMilliseconds(): number { return this.now; }
  createOffscreenCanvas(pixelWidth: number, pixelHeight: number): OffscreenCanvasSurface {
    this.offscreenCanvasCalls += 1;
    if (!this.offscreenCanvasSucceeds) return null as unknown as OffscreenCanvasSurface;
    return { renderingContext: fakeContext(), sourceSurface: {} as CanvasImageSource, pixelWidth, pixelHeight };
  }
  async loadBundledImage(): Promise<CanvasImageSource | null> { return this.bundledImage; }
}
