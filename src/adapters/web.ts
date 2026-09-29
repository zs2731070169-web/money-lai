import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import type {
  LogicalViewportSize, NormalizedTouchPoint, PlatformAdapter, PrimaryCanvas,
  SafeAreaInsets, ShareResult, TextInputRequest, TouchPhase,
} from '../core/platform';
import { COPY } from '../core/content/copy';
import { incrementAnonymousBurnCount } from './anonymous-count-client';

const MAX_RENDER_SCALE = 3;

export function resolveRenderScale(devicePixelRatio: number): number {
  return Math.max(1, Math.min(devicePixelRatio, MAX_RENDER_SCALE));
}
export function limitUnicodeLength(value: string, maximumLength: number): string {
  return Array.from(value).slice(0, maximumLength).join('');
}
export function normalizeMultilineInput(value: string, maximumLength: number): string {
  return limitUnicodeLength(value.replace(/\r\n?/g, '\n'), maximumLength);
}

export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

/** 写入严格串行，较慢的旧快照不会在新快照之后落盘。 */
export class SerializedStorage {
  private writeTail: Promise<void> = Promise.resolve();
  constructor(private readonly backend: StorageBackend) {}
  read(key: string): Promise<string | null> { return this.backend.get(key).catch(() => null); }
  write(key: string, value: string): Promise<boolean> {
    const operation = this.writeTail.then(() => this.backend.set(key, value));
    this.writeTail = operation.catch(() => undefined);
    return operation.then(() => true, () => false);
  }
}

function createStorageBackend(): StorageBackend {
  if (Capacitor.isNativePlatform()) {
    return {
      async get(key) { return (await Preferences.get({ key })).value; },
      async set(key, value) { await Preferences.set({ key, value }); },
    };
  }
  return {
    async get(key) { try { return window.localStorage.getItem(key); } catch { return null; } },
    async set(key, value) { window.localStorage.setItem(key, value); },
  };
}

function readSafeAreaCssVariable(variableName: string): number {
  const raw = window.getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createOverlayShell(transparent = false): HTMLDivElement {
  const shell = document.createElement('div');
  Object.assign(shell.style, { position: 'fixed', inset: '0', zIndex: '20', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', boxSizing: 'border-box', background: transparent ? 'transparent' : 'rgba(70,55,45,.28)', fontFamily: "ui-rounded,'PingFang SC',sans-serif" });
  return shell;
}
function createPaperPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  Object.assign(panel.style, { width: 'min(420px, 100%)', padding: '26px', boxSizing: 'border-box', borderRadius: '20px', background: '#F7EFE4', color: '#495853', boxShadow: '0 18px 55px rgba(74,55,42,.22)' });
  return panel;
}
function createWritingPanel(): HTMLDivElement {
  const panel = document.createElement('div');
  Object.assign(panel.style, { width: 'min(560px, 100%)', minHeight: 'min(68vh, 620px)', padding: 'clamp(22px, 6vw, 42px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#495853' });
  return panel;
}
function button(label: string, primary = false): HTMLButtonElement {
  const element = document.createElement('button'); element.textContent = label;
  Object.assign(element.style, { border: primary ? 'none' : '1px solid #BCA891', borderRadius: '999px', padding: '11px 17px', background: primary ? '#8B6D59' : 'transparent', color: primary ? '#FFF9F0' : '#5C5148', font: 'inherit', cursor: 'pointer' });
  return element;
}

function requestMultilineText(request: TextInputRequest): Promise<string | null> {
  return new Promise((resolve) => {
    const shell = createOverlayShell(true); const panel = createWritingPanel();
    // 用 contenteditable 代替 <textarea>：WebKit 只为表单文本域显示「第 X 行，共 Y 行/完成」
    // 原生附件条，contenteditable 聚焦时不出现该条；plaintext-only 保持纯文本输入与粘贴。
    const input = document.createElement('div');
    try { input.contentEditable = 'plaintext-only'; } catch { input.contentEditable = 'true'; }
    input.textContent = normalizeMultilineInput(request.initialValue, request.maxLength);
    input.autocapitalize = 'none'; input.spellcheck = false; input.setAttribute('autocorrect', 'off');
    Object.assign(input.style, { width: '100%', flex: '1', minHeight: 'min(42vh, 360px)', boxSizing: 'border-box', padding: '14px 6px', outline: 'none', overflowY: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', background: 'transparent', color: '#354940', font: `18px/1.55 ${request.fontFamily ?? "'Letter LXGW WenKai',cursive"}`, caretColor: '#6F4F3E' });
    const actions = document.createElement('div'); Object.assign(actions.style, { position: 'fixed', left: '50%', bottom: 'calc(env(safe-area-inset-bottom, 0px) + clamp(28px, 7vh, 76px))', transform: 'translateX(-50%)', width: 'min(280px, calc(100vw - 48px))', display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '0', zIndex: '22' });
    const cancel = button(COPY.cancel); const done = button(COPY.confirm, true);
    let finished = false;
    // innerText 把 contenteditable 的换行读成 \n；行内不间断空格归一为普通空格后，再按 Unicode 码点裁切长度
    const readInput = (): string => input.innerText.replace(/\u00a0/g, ' ');
    const normalizeInput = (): string => {
      const current = readInput();
      const normalized = normalizeMultilineInput(current, request.maxLength);
      if (normalized !== current) input.textContent = normalized;
      return normalized;
    };
    const finish = (result: string | null) => { if (finished) return; finished = true; input.blur(); shell.remove(); window.setTimeout(() => resolve(result), 50); };
    cancel.onclick = () => finish(null); done.onclick = () => finish(normalizeInput());
    input.addEventListener('input', normalizeInput);
    input.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish(null); if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); finish(normalizeInput()); } });
    actions.append(cancel, done); panel.append(input, actions); shell.append(panel); document.body.append(shell); window.setTimeout(() => input.focus(), 30);
  });
}

async function openExternalUrl(url: string): Promise<boolean> {
  try {
    if (url.startsWith('tel:')) { window.location.href = url; return true; }
    return window.open(url, '_blank', 'noopener,noreferrer') !== null;
  } catch { return false; }
}

function requestPrivacyConsent(policyUrl: string | null): Promise<boolean> {
  return new Promise((resolve) => {
    const shell = createOverlayShell(); const panel = createPaperPanel();
    const title = document.createElement('h1'); title.textContent = COPY.privacyTitle; Object.assign(title.style, { margin: '0 0 12px', fontSize: '24px', fontWeight: '600' });
    const summary = document.createElement('p'); summary.textContent = COPY.privacySummary; Object.assign(summary.style, { margin: '0 0 20px', lineHeight: '1.7', fontSize: '15px' });
    const policy = button(COPY.privacyPolicy); policy.disabled = !policyUrl; policy.onclick = () => { if (policyUrl) void openExternalUrl(policyUrl); };
    const agree = button(COPY.agree, true); agree.onclick = () => { shell.remove(); resolve(true); };
    const actions = document.createElement('div'); Object.assign(actions.style, { display: 'flex', justifyContent: 'space-between', gap: '12px' }); actions.append(policy, agree);
    panel.append(title, summary, actions); shell.append(panel); document.body.append(shell);
  });
}

export interface NativeTemporaryShareDependencies {
  writeFile(path: string, data: string): Promise<string>;
  share(title: string, url: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
}

export async function shareNativeTemporaryPng(
  fileName: string,
  base64Data: string,
  title: string,
  dependencies: NativeTemporaryShareDependencies,
): Promise<ShareResult> {
  const path = `letter-burning/${fileName}`;
  try {
    const uri = await dependencies.writeFile(path, base64Data);
    try { await dependencies.share(title, uri); return 'shared'; }
    catch (error) { return String(error).toLowerCase().includes('cancel') ? 'cancelled' : 'failed'; }
  } catch { return 'failed'; }
  finally { await dependencies.deleteFile(path).catch(() => undefined); }
}

async function shareTemporaryPng(fileName: string, base64Data: string, title: string): Promise<ShareResult> {
  if (Capacitor.isNativePlatform()) {
    return shareNativeTemporaryPng(fileName, base64Data, title, {
      async writeFile(path, data) { return (await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true })).uri; },
      async share(shareTitle, url) { await Share.share({ title: shareTitle, url, dialogTitle: shareTitle }); },
      async deleteFile(path) { await Filesystem.deleteFile({ path, directory: Directory.Cache }); },
    });
  }
  try {
    const bytes = Uint8Array.from(atob(base64Data), (character) => character.charCodeAt(0));
    const file = new File([bytes], fileName, { type: 'image/png' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ title, files: [file] }); return 'shared'; }
      catch (error) { return String(error).toLowerCase().includes('abort') ? 'cancelled' : 'failed'; }
    }
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(file); anchor.download = fileName; anchor.click(); URL.revokeObjectURL(anchor.href); return 'shared';
  } catch { return 'failed'; }
}

export function createWebPlatformAdapter(): PlatformAdapter {
  let cachedCanvas: PrimaryCanvas | null = null;
  const touchListeners = new Set<(phase: TouchPhase, point: NormalizedTouchPoint) => void>();
  const interruptionListeners = new Set<(phase: 'begin' | 'end') => void>();
  const visibilityListeners = new Set<(visible: boolean) => void>();
  const storage = new SerializedStorage(createStorageBackend());
  const countEndpoint = import.meta.env.VITE_BURN_COUNT_ENDPOINT?.trim() || null;
  const emitTouch = (phase: TouchPhase, event: PointerEvent) => {
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const point: NormalizedTouchPoint = { positionX: event.clientX - rect.left, positionY: event.clientY - rect.top, pointerId: event.pointerId };
    for (const listener of touchListeners) listener(phase, point);
  };
  return {
    createPrimaryCanvas() {
      if (cachedCanvas) return cachedCanvas;
      const canvas = document.createElement('canvas'); Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', touchAction: 'none' }); document.body.appendChild(canvas);
      const context = canvas.getContext('2d'); if (!context) throw new Error('当前环境不支持 Canvas 2D');
      const syncSize = () => { const scale = resolveRenderScale(window.devicePixelRatio || 1); canvas.width = Math.round(window.innerWidth * scale); canvas.height = Math.round(window.innerHeight * scale); context.setTransform(scale, 0, 0, scale, 0, 0); };
      syncSize(); window.addEventListener('resize', syncSize);
      canvas.addEventListener('pointerdown', (event) => { event.preventDefault(); canvas.setPointerCapture(event.pointerId); emitTouch('start', event); });
      canvas.addEventListener('pointermove', (event) => emitTouch('move', event)); canvas.addEventListener('pointerup', (event) => emitTouch('end', event)); canvas.addEventListener('pointercancel', (event) => emitTouch('end', event));
      cachedCanvas = { renderingContext: context, get logicalWidth() { return window.innerWidth; }, get logicalHeight() { return window.innerHeight; } }; return cachedCanvas;
    },
    requestFrame(callback) { return window.requestAnimationFrame(callback); },
    onTouch(listener) { touchListeners.add(listener); },
    createAudioContext() { try { const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; return Constructor ? new Constructor() : null; } catch { return null; } },
    onAudioInterruption(listener) { interruptionListeners.add(listener); },
    readPersistentValue(key) { return storage.read(key); },
    writePersistentValue(key, value) { return storage.write(key, value); },
    requestMultilineText,
    requestPrivacyConsent,
    requestConfirmation(message) { return Promise.resolve(window.confirm(message)); },
    openExternalUrl,
    shareTemporaryPng(request) { return shareTemporaryPng(request.fileName, request.base64Data, request.title); },
    async encodePng(surface) {
      try {
        const canvas = surface.sourceSurface as HTMLCanvasElement;
        const dataUrl = canvas.toDataURL('image/png');
        return dataUrl.startsWith('data:image/png;base64,') ? dataUrl.slice('data:image/png;base64,'.length) : null;
      } catch { return null; }
    },
    incrementAnonymousBurnCount() { return incrementAnonymousBurnCount(countEndpoint); },
    randomUnit() { try { const values = new Uint32Array(1); crypto.getRandomValues(values); return values[0] / 0x1_0000_0000; } catch { return Math.random(); } },
    getSafeAreaInsets(): SafeAreaInsets { return { top: readSafeAreaCssVariable('--safe-area-inset-top'), bottom: readSafeAreaCssVariable('--safe-area-inset-bottom'), left: readSafeAreaCssVariable('--safe-area-inset-left'), right: readSafeAreaCssVariable('--safe-area-inset-right') }; },
    getLogicalViewportSize(): LogicalViewportSize { return { width: window.innerWidth, height: window.innerHeight }; },
    onAppVisibilityChange(listener) {
      if (visibilityListeners.size === 0) document.addEventListener('visibilitychange', () => { const visible = document.visibilityState === 'visible'; for (const item of interruptionListeners) item(visible ? 'end' : 'begin'); for (const item of visibilityListeners) item(visible); });
      visibilityListeners.add(listener);
    },
    prefersReducedMotion() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } },
    nowMilliseconds() { return performance.now(); },
    createOffscreenCanvas(pixelWidth, pixelHeight) { try { const canvas = document.createElement('canvas'); canvas.width = pixelWidth; canvas.height = pixelHeight; const context = canvas.getContext('2d'); return context ? { renderingContext: context, sourceSurface: canvas, pixelWidth, pixelHeight } : null; } catch { return null; } },
    loadBundledImage(assetUrl) {
      return new Promise((resolve) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = assetUrl;
      });
    },
    async loadBundledAudio(assetUrl) {
      try {
        const response = await fetch(assetUrl);
        return response.ok ? await response.arrayBuffer() : null;
      } catch {
        return null;
      }
    },
  };
}
