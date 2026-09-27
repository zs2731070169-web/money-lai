import { AmountOdometerState, formatAmountWithGrouping } from '../cash/odometer';
import { blendCssColor } from '../utility/color-utilities';
import { AMOUNT_FONT_STACK, INK_TEXT_COLOR_HEX, MILESTONE_FLASH_COLOR_HEX } from './design-tokens';

/**
 * 金额里程表画师（cash-drawing 规格「金额累计反馈」）：
 * 按位滚动 + 错峰 + 微弹；等宽数字单元（固定步进）保证布局不横向抖动；
 * 金额为唯一主指标（无张数显示）。
 */

export interface OdometerPaintOptions {
  centerX: number;
  topY: number;
  fontSize: number;
  /** 里程碑闪色剩余比例（0=无闪色；>0 时由墨青渐向蜜金） */
  milestoneFlashRatio: number;
}

/** 缓出插值：滚动尾段减速 */
function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

export function paintAmountOdometer(
  renderingContext: CanvasRenderingContext2D,
  odometerState: AmountOdometerState,
  options: OdometerPaintOptions,
): void {
  const formattedTarget = formatAmountWithGrouping(odometerState.targetTotal);

  renderingContext.save();
  renderingContext.textAlign = 'center';
  renderingContext.textBaseline = 'top';
  renderingContext.font = `600 ${options.fontSize}px ${AMOUNT_FONT_STACK}`;

  // 微弹缩放：围绕里程表中心
  renderingContext.translate(options.centerX, options.topY);
  renderingContext.scale(odometerState.popScale, odometerState.popScale);

  // 里程表自持绘制色：常态墨青；里程碑闪色时墨青 → 蜜金瞬时过渡（不承担信息，仅装饰）。
  // 必须先于所有 fillText 赋值——否则货币符号会继承上游画师（纸币/钱包）残留的
  // 浅色 fillStyle，浅色画在浅色背景上即隐形（Canvas fillStyle 是全上下文可变状态）。
  const flashRatio = Math.min(1, Math.max(0, options.milestoneFlashRatio));
  renderingContext.fillStyle = flashRatio > 0
    ? blendCssColor(INK_TEXT_COLOR_HEX, MILESTONE_FLASH_COLOR_HEX, flashRatio)
    : INK_TEXT_COLOR_HEX;

  // 货币标识前缀（实测反馈：金额携带货币符号；固定绘制，不参与按位滚动）
  const currencySymbol = '$';
  const currencySymbolAdvance = renderingContext.measureText(currencySymbol).width * 1.3;

  // 等宽单元：以「0」的宽度为统一步进（含分隔符的紧凑排版）
  const digitAdvance = renderingContext.measureText('0').width * 1.06;
  const separatorAdvance = renderingContext.measureText(',').width * 1.15;
  const totalAdvance =
    currencySymbolAdvance +
    formattedTarget.split('').reduce((advance, character) => {
      return advance + (character === ',' ? separatorAdvance : digitAdvance);
    }, 0);
  let cursorX = -totalAdvance / 2;

  renderingContext.fillText(currencySymbol, cursorX + currencySymbolAdvance / 2, 0);
  cursorX += currencySymbolAdvance;

  let cellIndexFromHigh = 0;
  for (const character of formattedTarget) {
    if (character === ',') {
      renderingContext.fillText(',', cursorX + separatorAdvance / 2, 0);
      cursorX += separatorAdvance;
      continue;
    }
    const digitCell = odometerState.digitCells[cellIndexFromHigh];
    cellIndexFromHigh += 1;
    // 该位的当前显示值：起止数字按滚动进度插值（整数步进）
    const rollApplied = digitCell
      ? easeOutCubic(digitCell.rollProgress)
      : 1;
    const displayedDigit = digitCell
      ? Math.round(digitCell.startDigit + (digitCell.targetDigit - digitCell.startDigit) * rollApplied)
      : Number.parseInt(character, 10);
    renderingContext.fillText(String(displayedDigit), cursorX + digitAdvance / 2, 0);
    cursorX += digitAdvance;
  }

  renderingContext.restore();
}
