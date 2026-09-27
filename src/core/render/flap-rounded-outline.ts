import { Rect } from '../wallet/flap-hit-test';
import { FLAP_STRIP_COUNT, projectFlapPointAtParameter } from './flap-projection';

/** 面部纹理和投影轮廓使用相同的圆角半径。 */
export const FLAP_FRONT_CORNER_RADIUS_PIXELS = 16;
export const FLAP_BACK_CORNER_RADIUS_PIXELS = 14;

export interface ProjectedFlapBoundary {
  parameterT: number;
  y: number;
  /** 条带仍按完整投影宽度绘制，圆角由整体裁剪轮廓决定。 */
  halfWidth: number;
  leftX: number;
  rightX: number;
}

export interface ProjectedFlapShape {
  stripBoundaries: ProjectedFlapBoundary[];
  outlineBoundaries: ProjectedFlapBoundary[];
}

/**
 * 可复用的投影结果缓冲（flap-shape-buffer-reuse：GC 减压）。
 * 条带绘制每帧调用投影，快照式返回每帧新建 ~165 个边界对象 + 数组 + 闭包，
 * 60fps 下 ~1 万对象/秒直喂年轻代 GC——偶发掉帧的实测主源之一。
 * 缓冲内的对象实例跨帧复用（仅覆写字段）；填充后数组长度即有效条目数，
 * 调用方须在下一次填充前消费完毕（单线程画布时序天然满足）。
 */
export interface ProjectedFlapShapeBuffers {
  stripBoundaries: ProjectedFlapBoundary[];
  outlineBoundaries: ProjectedFlapBoundary[];
}

/** 创建空缓冲（首次按需增长，之后容量稳定零分配） */
export function createProjectedFlapShapeBuffers(): ProjectedFlapShapeBuffers {
  return { stripBoundaries: [], outlineBoundaries: [] };
}

/** 池按需增长：不足则补空白边界槽位（复用实例，仅改字段） */
function ensureBoundarySlots(slots: ProjectedFlapBoundary[], count: number): void {
  for (let index = slots.length; index < count; index += 1) {
    slots.push({ parameterT: 0, y: 0, halfWidth: 0, leftX: 0, rightX: 0 });
  }
}

/** 模块级比较器：避免每次填充新建排序闭包 */
const compareByParameterT = (first: ProjectedFlapBoundary, second: ProjectedFlapBoundary) =>
  first.parameterT - second.parameterT;

/** 把参数点投影写入目标边界槽位（原快照版 projectAt 闭包的逐式照搬，仅改写入方式） */
function writeProjectedBoundaryAt(
  target: ProjectedFlapBoundary,
  parameterT: number,
  walletRect: Rect,
  flapRotationDegrees: number,
  flapLengthPixels: number,
  walletCenterX: number,
  radius: number,
): void {
  const sourceY = parameterT * flapLengthPixels;
  const projection = projectFlapPointAtParameter(
    parameterT,
    flapRotationDegrees,
    flapLengthPixels,
    walletRect.width,
  );
  const distanceToEnd = Math.min(sourceY, flapLengthPixels - sourceY);
  const cornerInset = distanceToEnd >= radius || radius === 0
    ? 0
    : radius - Math.sqrt(
      Math.max(0, radius * radius - (radius - distanceToEnd) ** 2),
    );
  const roundedHalfWidth = projection.halfWidthPixels -
    cornerInset * projection.perspectiveScale;
  target.parameterT = parameterT;
  target.y = walletRect.top + projection.offsetFromHingePixels;
  target.halfWidth = projection.halfWidthPixels;
  target.leftX = walletCenterX - roundedHalfWidth;
  target.rightX = walletCenterX + roundedHalfWidth;
}

/** 缓冲复用版投影：结果写入 buffers（见接口注释的消费约束），数学与快照版逐式一致 */
export function projectRoundedFlapShapeInto(
  buffers: ProjectedFlapShapeBuffers,
  walletRect: Rect,
  foldLineY: number,
  flapRotationDegrees: number,
  cornerRadiusPixels: number,
): ProjectedFlapShapeBuffers {
  const flapLengthPixels = foldLineY - walletRect.top;
  const walletCenterX = walletRect.left + walletRect.width / 2;
  const radius = Math.max(0, Math.min(cornerRadiusPixels, flapLengthPixels / 2));

  // 条带边界：FLAP_STRIP_COUNT+1 个槽位，复用实例覆写字段
  const stripCount = FLAP_STRIP_COUNT + 1;
  ensureBoundarySlots(buffers.stripBoundaries, stripCount);
  for (let boundaryIndex = 0; boundaryIndex < stripCount; boundaryIndex += 1) {
    writeProjectedBoundaryAt(
      buffers.stripBoundaries[boundaryIndex],
      boundaryIndex / FLAP_STRIP_COUNT,
      walletRect, flapRotationDegrees, flapLengthPixels, walletCenterX, radius,
    );
  }

  // 轮廓 = 条带的字段拷贝 + 圆角细化采样，全部写入 outline 自有槽位。
  // 不得让 outline 槽位持有条带对象引用：排序会重排引用，若额外采样随后写入
  // 这些槽位，将透过别名改写条带对象（实测污染源）。
  // 圆弧贴近顶/底水平边时切线最陡，额外以 0.5px 采样，避免首段折线形成新台阶。
  let extraCount = 0;
  for (let sourceY = 0.5; sourceY < radius; sourceY += 0.5) {
    extraCount += 2;
  }
  const outlineCount = stripCount + extraCount;
  ensureBoundarySlots(buffers.outlineBoundaries, outlineCount);
  for (let boundaryIndex = 0; boundaryIndex < stripCount; boundaryIndex += 1) {
    copyBoundaryFields(
      buffers.stripBoundaries[boundaryIndex],
      buffers.outlineBoundaries[boundaryIndex],
    );
  }
  let outlineIndex = stripCount;
  for (let sourceY = 0.5; sourceY < radius; sourceY += 0.5) {
    writeProjectedBoundaryAt(
      buffers.outlineBoundaries[outlineIndex],
      sourceY / flapLengthPixels,
      walletRect, flapRotationDegrees, flapLengthPixels, walletCenterX, radius,
    );
    outlineIndex += 1;
    writeProjectedBoundaryAt(
      buffers.outlineBoundaries[outlineIndex],
      (flapLengthPixels - sourceY) / flapLengthPixels,
      walletRect, flapRotationDegrees, flapLengthPixels, walletCenterX, radius,
    );
    outlineIndex += 1;
  }
  buffers.outlineBoundaries.length = outlineCount;
  buffers.outlineBoundaries.sort(compareByParameterT);
  return buffers;
}

/** 字段拷贝（复用槽位，零分配） */
function copyBoundaryFields(
  source: ProjectedFlapBoundary,
  target: ProjectedFlapBoundary,
): void {
  target.parameterT = source.parameterT;
  target.y = source.y;
  target.halfWidth = source.halfWidth;
  target.leftX = source.leftX;
  target.rightX = source.rightX;
}

/** 把源纹理的圆角轮廓和条带边界投影到同一组屏幕坐标（独立快照；测试与低频路径） */
export function projectRoundedFlapShape(
  walletRect: Rect,
  foldLineY: number,
  flapRotationDegrees: number,
  cornerRadiusPixels: number,
): ProjectedFlapShape {
  const buffers = createProjectedFlapShapeBuffers();
  projectRoundedFlapShapeInto(
    buffers, walletRect, foldLineY, flapRotationDegrees, cornerRadiusPixels,
  );
  // 缓冲为本次调用私有：浅拷贝数组即独立快照（对象引用不再被改写）
  return {
    stripBoundaries: buffers.stripBoundaries.slice(),
    outlineBoundaries: buffers.outlineBoundaries.slice(),
  };
}
