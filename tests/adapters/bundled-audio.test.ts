import { describe, expect, it } from 'vitest';
import { createWebPlatformAdapter } from '../../src/adapters/web';

class FakeXmlHttpRequest {
  static status = 0;
  static response: ArrayBuffer | null = new Uint8Array([82, 73, 70, 70]).buffer;
  status = FakeXmlHttpRequest.status;
  response = FakeXmlHttpRequest.response;
  responseType = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, () => void>();
  addEventListener(type: string, listener: () => void): void { this.listeners.set(type, listener); }
  open(): void {}
  send(): void { this.onload?.(); this.listeners.get('load')?.(); }
}

describe('随包音频加载', () => {
  it('接受 capacitor 本地 scheme 的 status=0 非空响应', async () => {
    const original = globalThis.XMLHttpRequest;
    Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, writable: true, value: FakeXmlHttpRequest });
    try {
      const adapter = createWebPlatformAdapter();
      await expect(adapter.loadBundledAudio('capacitor://localhost/assets/audio/envelop_draw_out.wav')).resolves.toBeInstanceOf(ArrayBuffer);
    } finally {
      if (original) Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, writable: true, value: original });
      else Reflect.deleteProperty(globalThis, 'XMLHttpRequest');
    }
  });

  it('HTTP 非成功状态仍按缺失静默降级', async () => {
    const original = globalThis.XMLHttpRequest;
    FakeXmlHttpRequest.status = 404;
    FakeXmlHttpRequest.response = new Uint8Array([1]).buffer;
    Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, writable: true, value: FakeXmlHttpRequest });
    try {
      const adapter = createWebPlatformAdapter();
      await expect(adapter.loadBundledAudio('/assets/audio/envelop_draw_out.wav')).resolves.toBeNull();
    } finally {
      FakeXmlHttpRequest.status = 0;
      FakeXmlHttpRequest.response = new Uint8Array([82, 73, 70, 70]).buffer;
      if (original) Object.defineProperty(globalThis, 'XMLHttpRequest', { configurable: true, writable: true, value: original });
      else Reflect.deleteProperty(globalThis, 'XMLHttpRequest');
    }
  });
});
