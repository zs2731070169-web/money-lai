#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const textExtensions = new Set(['.ts', '.js', '.html', '.json', '.xml', '.plist', '.swift', '.java', '.gradle']);

function collectTextFiles(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((entry) => collectTextFiles(join(path, entry)));
}

const releaseFiles = [
  ...collectTextFiles('src'),
  ...collectTextFiles('dist'),
  ...collectTextFiles('ios/App/App').filter((path) => !path.includes('/public/')),
  ...collectTextFiles('android/app/src/main').filter((path) => !path.includes('/assets/public/')),
  'index.html',
  'package.json',
  'capacitor.config.ts',
].filter((path) => textExtensions.has(extname(path)) || ['package.json', 'index.html'].includes(path));

const forbiddenBranding = /钱包|金额|纸币|抽钞|money-lai/i;
const violations = [];
for (const path of releaseFiles) {
  const source = readFileSync(path, 'utf8');
  if (forbiddenBranding.test(source)) violations.push(`${path}: 仍含旧货币语义`);
}

const infoPlist = readFileSync('ios/App/App/Info.plist', 'utf8');
if (/NSPhotoLibrary|NSPhotoLibraryAddUsageDescription|PHPhotoLibrary/.test(infoPlist)) violations.push('ios/App/App/Info.plist: 声明了照片图库权限');

const builtSources = collectTextFiles('dist').filter((path) => ['.js', '.html'].includes(extname(path))).map((path) => readFileSync(path, 'utf8')).join('\n');
if (/VITE_[A-Z0-9_]+/.test(builtSources)) violations.push('dist: 残留未替换的 Vite 构建变量');

if (violations.length > 0) {
  console.error('✖ 发行路径审计失败：');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}

console.log(`✔ 发行路径审计通过（${releaseFiles.length} 个文本文件；无旧货币语义、照片权限或未替换构建变量）`);
