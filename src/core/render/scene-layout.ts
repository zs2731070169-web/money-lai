import { SafeAreaInsets } from '../platform';
import { Rect, WALLET_FOLD_HEIGHT_RATIO } from '../wallet/flap-hit-test';
import { billDrawTravelDistance } from './bill-geometry';

/**
 * 场景布局（game-visuals 规格「极简画面构成」的几何落点）：
 * 依据视口与安全区计算钱包、金额里程表、元进程入口的位置；纯函数可单测。
 * 构图：钱包竖长静物居于画面中下部，金额里程表居上方安全区内，元进程入口在右上角。
 */

export interface SceneLayout {
  /** 钱包主体外接矩形（逻辑像素） */
  walletRect: Rect;
  /** 翻盖折线 Y（翻盖占钱包上部，绕此线翻开） */
  walletFoldLineY: number;
  /** 钱包口抓取热区（纸币露出处，宽容余量由抽钞判定模块外扩） */
  walletMouthRect: Rect;
  /** 当前张纸币的逻辑高度（抽出比例的渲染换算基准） */
  activeBillHeight: number;
  /** 金额里程表锚点 */
  odometerAnchor: { centerX: number; topY: number };
  /** 元进程入口（角落轻量图标） */
  metaEntryAnchor: { centerX: number; centerY: number };
}

export function computeSceneLayout(
  viewportWidth: number,
  viewportHeight: number,
  safeArea: SafeAreaInsets,
): SceneLayout {
  // 钱包是画面主角：占屏宽过半（上限防平板撑爆），竖长比例 1.85
  const walletWidth = Math.min(210, Math.round(viewportWidth * 0.52));
  const walletHeight = Math.round(walletWidth * 1.85);
  const walletLeft = Math.round((viewportWidth - walletWidth) / 2);
  // 钱包置于画面中下部（静物构图，留白在上）；短屏时锚到底部安全区余量，构图不裁切
  const walletTop = Math.max(0, Math.min(
    Math.round(viewportHeight * 0.48),
    viewportHeight - safeArea.bottom - walletHeight,
  ));
  const walletFoldLineY = walletTop + Math.round(walletHeight * WALLET_FOLD_HEIGHT_RATIO);

  const mouthHeight = 44;
  const walletMouthRect = {
    left: walletLeft + 6,
    top: walletFoldLineY - mouthHeight + 10,
    width: walletWidth - 12,
    height: mouthHeight,
  };

  return {
    walletRect: { left: walletLeft, top: walletTop, width: walletWidth, height: walletHeight },
    walletFoldLineY,
    walletMouthRect,
    activeBillHeight: billDrawTravelDistance(
      { left: walletLeft, top: walletTop, width: walletWidth, height: walletHeight },
      walletFoldLineY,
    ),
    odometerAnchor: { centerX: Math.round(viewportWidth / 2), topY: safeArea.top + 80 },
    metaEntryAnchor: {
      centerX: Math.round(viewportWidth - safeArea.right - 36),
      centerY: Math.round(safeArea.top + 44),
    },
  };
}
