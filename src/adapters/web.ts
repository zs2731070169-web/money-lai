import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import type {
  LogicalViewportSize, NormalizedTouchPoint, PlatformAdapter, PrimaryCanvas,
  SafeAreaInsets, ShareResult, TextInputRequest, TextInputResult, TouchPhase,
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
  // position:relative 作为字数指示的锚点：指示挂在面板层，避免被输入区 overflow:hidden 裁切
  Object.assign(panel.style, { position: 'relative', width: 'min(560px, 100%)', height: 'min(68dvh, 620px)', maxHeight: 'calc(100dvh - 48px)', padding: 'clamp(22px, 6vw, 42px)', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden', color: '#495853' });
  return panel;
}
function button(label: string, primary = false): HTMLButtonElement {
  const element = document.createElement('button'); element.textContent = label;
  Object.assign(element.style, { border: primary ? 'none' : '1px solid #BCA891', borderRadius: '999px', padding: '11px 17px', background: primary ? '#8B6D59' : 'transparent', color: primary ? '#FFF9F0' : '#5C5148', font: 'inherit', cursor: 'pointer' });
  return element;
}

/**
 * 页面内确认层：系统弹窗（window.confirm）会触发 iOS 对 WKWebView 的音频挂起，
 * BGM 随之中断——自绘遮罩+纸色确认卡全程无系统介入，音频与 rAF 均不受扰。
 * 遮罩空白处点按视为取消；卡片层拦截冒泡。
 */
function requestInPageConfirmation(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const shell = createOverlayShell(false);
    const panel = createPaperPanel();
    Object.assign(panel.style, { width: 'min(300px, 100%)', padding: '26px 24px 20px', textAlign: 'center' });
    const messageText = document.createElement('div');
    messageText.textContent = message;
    Object.assign(messageText.style, { font: "16px/1.6 ui-rounded,'PingFang SC',sans-serif", marginBottom: '20px', whiteSpace: 'pre-wrap' });
    const settle = (confirmed: boolean) => { shell.remove(); resolve(confirmed); };
    const cancelButton = button(COPY.cancel); cancelButton.addEventListener('click', () => settle(false));
    const confirmButton = button(COPY.confirm, true); confirmButton.addEventListener('click', () => settle(true));
    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', justifyContent: 'center', gap: '20px' });
    actions.append(cancelButton, confirmButton);
    panel.append(messageText, actions);
    panel.addEventListener('click', (event) => event.stopPropagation());
    shell.addEventListener('click', (event) => { if (event.target === shell) settle(false); });
    shell.append(panel);
    document.body.append(shell);
  });
}

/** 隐藏输入层滚动条但保留滚动：scrollbar-width 走行内，::-webkit-scrollbar 只能靠注入的一次性规则表达。 */
let draftScrollbarRuleReady = false;
function hideDraftScrollbar(element: HTMLElement): void {
  element.style.scrollbarWidth = 'none';
  element.classList.add('draft-scroll-without-bar');
  if (draftScrollbarRuleReady) return;
  const rule = document.createElement('style');
  rule.textContent = '.draft-scroll-without-bar::-webkit-scrollbar{display:none}';
  document.head.append(rule);
  draftScrollbarRuleReady = true;
}

function requestMultilineText(request: TextInputRequest): Promise<TextInputResult> {
  return new Promise((resolve) => {
    const shell = createOverlayShell(true); const panel = createWritingPanel();
    // 用 contenteditable 代替 <textarea>：WebKit 为表单文本域显示「第 X 行，共 Y 行/完成」
    // 附件条，contenteditable 不出现该条；plaintext-only 保持纯文本输入与粘贴。
    // 注意 iOS 26 对 contenteditable 聚焦也会挂底部键盘附属条，随键盘一起出现，属系统行为。
    const draftPaddingY = '61px'; const draftPaddingX = '29px';
    // 编辑区保持单页高度，超出的正文只在输入层内部滚动。
    const inputArea = document.createElement('div');
    Object.assign(inputArea.style, { position: 'relative', width: '100%', flex: '1', minHeight: '0', overflow: 'hidden' });
    const input = document.createElement('div');
    try { input.contentEditable = 'plaintext-only'; } catch { input.contentEditable = 'true'; }
    input.textContent = normalizeMultilineInput(request.initialValue, request.maxLength);
    input.autocapitalize = 'none'; input.spellcheck = false; input.setAttribute('autocorrect', 'off');
    // body 上的 user-select:none 供画布手势防误选；编辑区显式放开，保证长按/拖选可跨多字符
    Object.assign(input.style, { width: '100%', height: '100%', boxSizing: 'border-box', padding: `${draftPaddingY} ${draftPaddingX}`, outline: 'none', overflowY: 'auto', overscrollBehaviorY: 'contain', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', background: 'transparent', color: '#354940', letterSpacing: '-0.2px', font: `17px/1.4 ${request.fontFamily ?? "'Letter LXGW WenKai',cursive"}`, caretColor: '#6F4F3E', userSelect: 'text', webkitUserSelect: 'text' });
    hideDraftScrollbar(input);
    const actions = document.createElement('div');
    Object.assign(actions.style, { position: 'fixed', left: '50%', bottom: 'calc(env(safe-area-inset-bottom, 0px) + clamp(28px, 7vh, 50px))', transform: 'translateX(-50%)', width: 'min(300px, calc(100vw - 48px))', display: 'flex', justifyContent: 'center', gap: '36px', marginTop: '0', zIndex: '22' });
    const cancel = button(COPY.cancel); const done = button(COPY.confirm, true);
    let finished = false;
    // innerText 把 contenteditable 的换行读成 \n；行内不间断空格归一为普通空格后，再按 Unicode 码点裁切长度
    const readInput = (): string => input.innerText.replace(/\u00a0/g, ' ');
    // 空态引导占位：输入面板激活期间信纸不再画引导语，改呈现在输入区；
    // 输入第一个字符后自动隐藏，清空回纯空白时恢复。
    const draftPlaceholder = document.createElement('div');
    draftPlaceholder.textContent = request.placeholder;
    Object.assign(draftPlaceholder.style, { position: 'absolute', left: draftPaddingX, right: draftPaddingX, top: draftPaddingY, color: 'rgba(53,73,64,.82)', pointerEvents: 'none', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', letterSpacing: '-0.2px', font: `17px/1.4 ${request.fontFamily ?? "'Letter LXGW WenKai',cursive"}` });
    const refreshDraftPlaceholder = (): void => {
      if (!request.placeholder) return;
      draftPlaceholder.style.visibility = readInput().trim() === '' ? 'visible' : 'hidden';
    };
    // 右下角字数指示：当前字数与总上限同用 Unicode 码点口径，随输入即时刷新。
    // 挂在面板层（面板已 position:relative）：输入区的 overflow:hidden 会把出界的负偏移裁掉，
    // 面板右缘更靠外，正偏移即可贴近纸角；负值同样会被面板裁切，勿用。
    const characterCounter = document.createElement('div');
    Object.assign(characterCounter.style, { position: 'absolute', right: '5px', bottom: '42px', pointerEvents: 'none', color: 'rgba(53,73,64)', font: "14px ui-rounded,'PingFang SC',sans-serif", fontVariantNumeric: 'tabular-nums' });
    const refreshCharacterCounter = (): void => {
      characterCounter.textContent = `${Array.from(readInput()).length}/${request.maxLength}`;
    };
    const normalizeInput = (): string => {
      const current = readInput();
      const normalized = normalizeMultilineInput(current, request.maxLength);
      if (normalized !== current) input.textContent = normalized;
      refreshDraftPlaceholder();
      refreshCharacterCounter();
      return normalized;
    };
    const finish = (result: TextInputResult) => { if (finished) return; finished = true; input.blur(); shell.remove(); window.setTimeout(() => resolve(result), 50); };
    cancel.onclick = () => finish(null); done.onclick = () => finish(normalizeInput());
    input.addEventListener('input', normalizeInput);
    input.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish(null); if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); finish(normalizeInput()); } });
    refreshDraftPlaceholder(); refreshCharacterCounter();
    actions.append(cancel, done); inputArea.append(input, draftPlaceholder); panel.append(inputArea, actions, characterCounter); shell.append(panel);
    if (request.menuRect) {
      // 编辑层覆盖 Canvas；在原有菜单图标上方留同尺寸透明热区，暂停时带回草稿。
      const menu = document.createElement('button');
      menu.type = 'button'; menu.setAttribute('aria-label', '打开菜单');
      Object.assign(menu.style, { position: 'fixed', left: `${request.menuRect.left}px`, top: `${request.menuRect.top}px`, width: `${request.menuRect.width}px`, height: `${request.menuRect.height}px`, zIndex: '23', padding: '0', border: '0', background: 'transparent', cursor: 'pointer' });
      menu.onclick = () => finish({ kind: 'menu', draft: normalizeInput() });
      shell.append(menu);
    }
    // 自动唤起键盘与底部系统输入条, 书写区自然聚焦
    document.body.append(shell);
    window.setTimeout(() => { if (!finished) input.focus(); }, 30);
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


/** 寄送输入面板：收件人邮箱 = 前缀输入 + 类型下拉，暖纸样式与 App 基调一致。 */
const EMAIL_DOMAINS = ['qq.com', '163.com', '126.com', 'gmail.com', 'outlook.com', 'icloud.com', '自定义'] as const;

function isValidEmailPrefix(prefix: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._%-]*$/.test(prefix) && prefix.length >= 2;
}

function requestDispatchInput(): Promise<string | null> {
  return new Promise((resolve) => {
    const shell = createOverlayShell(false);
    const panel = createPaperPanel();
    Object.assign(panel.style, { width: 'min(340px, 100%)', textAlign: 'center' });
    const title = document.createElement('div');
    title.textContent = COPY.dispatchInputTitle;
    Object.assign(title.style, { font: "18px/1.4 ui-rounded,'PingFang SC',sans-serif", marginBottom: '20px' });
    // 前缀输入 + 类型下拉并排
    const inputRow = document.createElement('div');
    Object.assign(inputRow.style, { display: 'flex', gap: '0', marginBottom: '16px' });
    const prefixInput = document.createElement('input');
    prefixInput.type = 'text';
    prefixInput.placeholder = '邮箱前缀';
    prefixInput.autocapitalize = 'none'; prefixInput.spellcheck = false;
    Object.assign(prefixInput.style, {
      flex: '1', minWidth: '0', padding: '12px 14px', border: '1px solid #BCA891', borderRight: 'none',
      borderRadius: '10px 0 0 10px', outline: 'none', font: "16px ui-rounded,'PingFang SC',sans-serif",
      background: '#FFF9F0', color: '#495853', boxSizing: 'border-box',
    });
    const domainSelect = document.createElement('select');
    for (const domain of EMAIL_DOMAINS) {
      const option = document.createElement('option');
      option.value = domain; option.textContent = domain === '自定义' ? '自定义…' : `@${domain}`;
      domainSelect.appendChild(option);
    }
    Object.assign(domainSelect.style, {
      padding: '12px 10px', border: '1px solid #BCA891', borderRadius: '0 10px 10px 0',
      font: "14px ui-rounded,'PingFang SC',sans-serif", background: '#F1E4D2', color: '#495853',
      cursor: 'pointer', boxSizing: 'border-box', appearance: 'none', textAlign: 'center',
    });
    // 自定义域切换时显示额外输入框
    const customDomainRow = document.createElement('div');
    customDomainRow.style.cssText = 'display:none; margin:-12px 0 16px;';
    const customDomainInput = document.createElement('input');
    customDomainInput.type = 'text'; customDomainInput.placeholder = '输入完整域名（如 example.com）';
    Object.assign(customDomainInput.style, {
      width: '100%', padding: '12px 14px', border: '1px solid #BCA891', borderRadius: '10px',
      outline: 'none', font: "16px ui-rounded,'PingFang SC',sans-serif", background: '#FFF9F0',
      color: '#495853', boxSizing: 'border-box',
    });
    customDomainRow.appendChild(customDomainInput);
    domainSelect.addEventListener('change', () => {
      customDomainRow.style.display = domainSelect.value === '自定义' ? 'block' : 'none';
      if (domainSelect.value !== '自定义') customDomainInput.value = '';
    });
    inputRow.append(prefixInput, domainSelect);
    // 确认/取消
    let settled = false;
    const finish = (result: string | null) => {
      if (settled) return; settled = true;
      prefixInput.blur(); customDomainInput.blur(); shell.remove();
      resolve(result);
    };
    const readFullAddress = (): string | null => {
      const prefix = prefixInput.value.trim();
      if (!isValidEmailPrefix(prefix)) return null;
      const domain = domainSelect.value === '自定义'
        ? customDomainInput.value.trim().replace(/^@/, '')
        : domainSelect.value;
      if (!domain || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$/.test(domain)) return null;
      return `${prefix}@${domain}`;
    };
    const confirmButton = button(COPY.dispatchInputConfirm, true);
    const cancelButton = button(COPY.cancel);
    const actions = document.createElement('div');
    Object.assign(actions.style, { display: 'flex', justifyContent: 'center', gap: '14px' });
    const refreshConfirm = () => { confirmButton.disabled = readFullAddress() === null; };
    prefixInput.addEventListener('input', refreshConfirm);
    domainSelect.addEventListener('change', refreshConfirm);
    customDomainInput.addEventListener('input', refreshConfirm);
    confirmButton.addEventListener('click', () => { finish(readFullAddress()); });
    cancelButton.addEventListener('click', () => finish(null));
    prefixInput.addEventListener('keydown', (event) => { if (event.key === 'Escape') finish(null); });
    actions.append(cancelButton, confirmButton);
    panel.append(title, inputRow, customDomainRow, actions);
    shell.addEventListener('click', (event) => { if (event.target === shell) finish(null); });
    shell.append(panel);
    document.body.append(shell);
    prefixInput.focus();
    refreshConfirm();
  });
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
    requestDispatchInput,
    requestPrivacyConsent,
    requestConfirmation(message) { return requestInPageConfirmation(message); },
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
    loadBundledAudio(assetUrl) {
      // WKWebView 的 capacitor:// 自定义 scheme 对 Fetch API 一律返回 404；XHR 才是受支持的加载路径
      return new Promise((resolve) => {
        try {
          const request = new XMLHttpRequest();
          request.open('GET', assetUrl, true);
          request.responseType = 'arraybuffer';
          request.onload = () => {
            const response = request.response as ArrayBuffer | null;
            // capacitor:// 本地资源在 WKWebView 中可能返回 status=0；只要确实拿到非空字节，就不能误判为缺失。
            const httpSuccess = request.status >= 200 && request.status < 300;
            const localSchemeSuccess = request.status === 0 && response instanceof ArrayBuffer && response.byteLength > 0;
            resolve(httpSuccess || localSchemeSuccess ? response : null);
          };
          request.onerror = () => { resolve(null); };
          request.send();
        } catch {
          resolve(null);
        }
      });
    },
  };
}
