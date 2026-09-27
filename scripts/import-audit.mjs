#!/usr/bin/env node
/**
 * 内核平台依赖静态审计（platform-adaptation 规格「平台无关内核纪律」的回归入口）。
 *
 * 扫描目标目录（默认 src/core）下全部 .ts 文件，出现平台专有 API 的直接引用即失败退出。
 * 用法：node scripts/import-audit.mjs [扫描目录]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 禁止在内核出现的平台专有引用模式（对应规格 R「平台无关内核纪律」） */
const FORBIDDEN_PATTERNS = [
  { pattern: /from\s+['"]wx(\/[^'"]*)?['"]/, label: 'import wx（微信专有 API）' },
  { pattern: /from\s+['"]@capacitor[^'"]*['"]/, label: 'import @capacitor（Capacitor 插件）' },
  { pattern: /\bwindow\s*\./, label: 'window.* 直用（应经 PlatformAdapter）' },
  { pattern: /\bdocument\s*\./, label: 'document.* 直用（应经 PlatformAdapter）' },
  { pattern: /\bnew\s+AudioContext\b/, label: '直接构造 AudioContext（应经 adapter.createAudioContext）' },
  { pattern: /\bglobalThis\s*\./, label: 'globalThis.* 直用（应经 PlatformAdapter）' },
];

/** 递归收集目录下全部 .ts 文件 */
function collectTypeScriptFiles(rootDirectory) {
  const collectedFiles = [];
  for (const entryName of readdirSync(rootDirectory)) {
    const entryPath = join(rootDirectory, entryName);
    const entryStat = statSync(entryPath);
    if (entryStat.isDirectory()) {
      collectedFiles.push(...collectTypeScriptFiles(entryPath));
    } else if (entryName.endsWith('.ts')) {
      collectedFiles.push(entryPath);
    }
  }
  return collectedFiles;
}

const auditRootDirectory = process.argv[2] ?? 'src/core';
const typeScriptFiles = collectTypeScriptFiles(auditRootDirectory);

const violations = [];
for (const filePath of typeScriptFiles) {
  const fileLines = readFileSync(filePath, 'utf8').split('\n');
  fileLines.forEach((lineContent, lineIndex) => {
    for (const { pattern, label } of FORBIDDEN_PATTERNS) {
      if (pattern.test(lineContent)) {
        violations.push(`${filePath}:${lineIndex + 1} ${label} → ${lineContent.trim()}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error(`✖ 内核平台依赖审计失败（${auditRootDirectory}，${violations.length} 处违规）：`);
  for (const violation of violations) console.error('  ' + violation);
  process.exit(1);
}

console.log(`✔ 内核平台依赖审计通过（${auditRootDirectory}，${typeScriptFiles.length} 个文件）`);
