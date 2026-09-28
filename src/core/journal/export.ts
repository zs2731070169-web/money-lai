import { COPY } from '../content/copy';
import type { JournalEntry } from './journal-state';
import { patternById } from '../letter/patterns';
import { paintPatternArt } from '../render/letter-painter';

export const EXPORT_MAX_PIXELS = 16_000_000;
export const EXPORT_MAX_DIMENSION = 16_384;
export const EXPORT_CHUNK_HEIGHT = 2_048;
export interface JournalExportPlan { width: number; height: number; scale: number; columns: number; chunkHeight: number; chunkCount: number }

export function computeJournalExportPlan(entryCount: number): JournalExportPlan {
  const baseWidth = 1200;
  const columns = 3;
  const rows = Math.max(1, Math.ceil(entryCount / columns));
  const baseHeight = 190 + rows * 270 + 100;
  const scale = Math.min(1, Math.sqrt(EXPORT_MAX_PIXELS / (baseWidth * baseHeight)), EXPORT_MAX_DIMENSION / baseWidth, EXPORT_MAX_DIMENSION / baseHeight);
  const width = Math.max(1, Math.floor(baseWidth * scale)); const height = Math.max(1, Math.floor(baseHeight * scale));
  const chunkHeight = Math.min(EXPORT_CHUNK_HEIGHT, height);
  return { width, height, scale, columns, chunkHeight, chunkCount: Math.ceil(height / chunkHeight) };
}

export function paintJournalExport(
  context: CanvasRenderingContext2D,
  entries: readonly JournalEntry[],
  plan: JournalExportPlan,
): void {
  context.save(); context.scale(plan.scale, plan.scale);
  const width = plan.width / plan.scale;
  const padding = 56; const gap = 28; const cellWidth = (width - padding * 2 - gap * 2) / 3; const cellHeight = 232;
  for (let chunkIndex = 0; chunkIndex < plan.chunkCount; chunkIndex += 1) {
    const outputTop = chunkIndex * plan.chunkHeight; const outputBottom = Math.min(plan.height, outputTop + plan.chunkHeight);
    const chunkTop = outputTop / plan.scale; const chunkBottom = outputBottom / plan.scale;
    context.save(); context.beginPath(); context.rect(0, chunkTop, width, chunkBottom - chunkTop); context.clip();
    context.fillStyle = '#F7EFE4'; context.fillRect(0, chunkTop, width, chunkBottom - chunkTop);
    if (chunkTop < 190) {
      context.fillStyle = '#495853'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.font = "38px ui-rounded,'PingFang SC',sans-serif"; context.fillText(COPY.journal, width / 2, 72);
      context.globalAlpha = 0.62; context.font = "20px ui-rounded,'PingFang SC',sans-serif"; context.fillText(COPY.localOnly, width / 2, 126); context.globalAlpha = 1;
    }
    const firstRow = Math.max(0, Math.floor((chunkTop - 175 - cellHeight) / 270));
    const lastRow = Math.ceil((chunkBottom - 175) / 270);
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = 0; column < plan.columns; column += 1) {
        const index = row * plan.columns + column; const entry = entries[index]; if (!entry) continue;
        const left = padding + column * (cellWidth + gap); const top = 175 + row * 270;
        paintPatternArt(context, { left, top, width: cellWidth, height: cellHeight - 38 }, patternById(entry.patternId));
        context.fillStyle = '#495853'; context.textAlign = 'left'; context.font = "18px ui-rounded,'PingFang SC',sans-serif"; context.fillText(entry.createdAtIso.slice(0, 10), left, top + cellHeight - 13);
      }
    }
    context.restore();
  }
  context.restore();
}
