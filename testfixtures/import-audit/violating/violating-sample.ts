// 故意违规样例：仅供 scripts/import-audit.mjs 自检使用，不属于工程源码（tsconfig 已排除）
import { login } from 'wx';

export const badViewportWidth = window.innerWidth;
export const badDocumentTitle = document.title;
export const badAudioContext = new AudioContext();
export const badLogin = login;
