import { describe, expect, it } from 'vitest';
import {
  ProjectedFlapShapeBuffers,
  createProjectedFlapShapeBuffers,
  projectRoundedFlapShape,
  projectRoundedFlapShapeInto,
} from '../../src/core/render/flap-rounded-outline';
import { projectFlapPointAtParameter } from '../../src/core/render/flap-projection';

const walletRect = { left: 97, top: 367, width: 209, height: 386 };
const foldLineY = 541;
const flapLength = foldLineY - walletRect.top;
const centerX = walletRect.left + walletRect.width / 2;

describe('翻盖投影圆角', () => {
  it.each([0, 45, 120, 180])('%d° 正反面四角沿纹理圆弧内缩', (angle) => {
    for (const radius of [16, 14]) {
      const shape = projectRoundedFlapShape(
        walletRect, foldLineY, angle, radius,
      );
      const boundaries = shape.outlineBoundaries;
      const topProjection = projectFlapPointAtParameter(0, angle, flapLength, walletRect.width);
      const bottomProjection = projectFlapPointAtParameter(1, angle, flapLength, walletRect.width);
      const topLeft = boundaries[0].leftX;
      const topRight = boundaries[0].rightX;
      const bottomLeft = boundaries.at(-1)!.leftX;
      const bottomRight = boundaries.at(-1)!.rightX;

      expect(topLeft).toBeCloseTo(centerX - topProjection.halfWidthPixels + radius, 5);
      expect(topRight).toBeCloseTo(centerX + topProjection.halfWidthPixels - radius, 5);
      expect(bottomLeft).toBeCloseTo(
        centerX - bottomProjection.halfWidthPixels + radius * bottomProjection.perspectiveScale, 5,
      );
      expect(bottomRight).toBeCloseTo(
        centerX + bottomProjection.halfWidthPixels - radius * bottomProjection.perspectiveScale, 5,
      );
      expect(boundaries.length).toBeGreaterThan(20);
      expect(boundaries.every((point) =>
        Number.isFinite(point.leftX) && Number.isFinite(point.rightX) && Number.isFinite(point.y),
      )).toBe(true);
    }
  });

  it('直立时顶角从内缩位置连续过渡到侧边，再回到内缩的底角', () => {
    const boundaries = projectRoundedFlapShape(walletRect, foldLineY, 180, 16).outlineBoundaries;
    const leftX = walletRect.left;
    const leftEdgeX = boundaries.map((point) => point.leftX);
    expect(leftEdgeX[0]).toBeGreaterThan(leftX + 15);
    expect(Math.min(...leftEdgeX)).toBeCloseTo(leftX, 5);
    expect(leftEdgeX.at(-1)).toBeGreaterThan(leftX + 15);
    for (let index = 1; index < boundaries.length; index += 1) {
      expect(Math.abs(boundaries[index].leftX - boundaries[index - 1].leftX)).toBeLessThan(5);
    }
  });

  it('触面末段自由边平滑抵达钱包口，关闭稳态不再跳长', () => {
    const approaching = projectRoundedFlapShape(walletRect, foldLineY, 0.1, 16);
    const settled = projectRoundedFlapShape(walletRect, foldLineY, 0, 16);
    expect(approaching.outlineBoundaries.at(-1)!.y).toBeGreaterThan(foldLineY - 0.2);
    expect(settled.outlineBoundaries.at(-1)!.y).toBeCloseTo(foldLineY, 5);
  });
});

describe('投影缓冲复用等价（flap-shape-buffer-reuse：GC 减压零输出变化）', () => {
  it('Into 路径与快照路径在角度×圆角×矩形网格上逐字段一致', () => {
    const testRects = [
      { left: 97, top: 367, width: 209, height: 386 },
      { left: 0, top: 0, width: 402, height: 300 },
      { left: 33.5, top: 120.25, width: 150.75, height: 200.5 },
    ];
    for (const rect of testRects) {
      for (let angle = 0; angle <= 180; angle += 7.3) {
        for (const radius of [0, 3, 14, 16, 40]) {
          const foldY = rect.top + rect.height / 2;
          const snapshotShape = projectRoundedFlapShape(rect, foldY, angle, radius);
          const buffers: ProjectedFlapShapeBuffers = createProjectedFlapShapeBuffers();
          projectRoundedFlapShapeInto(buffers, rect, foldY, angle, radius);
          expect(buffers.stripBoundaries.length).toBe(snapshotShape.stripBoundaries.length);
          expect(buffers.outlineBoundaries.length).toBe(snapshotShape.outlineBoundaries.length);
          for (let index = 0; index < snapshotShape.stripBoundaries.length; index += 1) {
            expect(buffers.stripBoundaries[index]).toEqual(snapshotShape.stripBoundaries[index]);
          }
          for (let index = 0; index < snapshotShape.outlineBoundaries.length; index += 1) {
            expect(buffers.outlineBoundaries[index]).toEqual(snapshotShape.outlineBoundaries[index]);
          }
        }
      }
    }
  });

  it('缓冲跨次复用：同一缓冲连续填充不同角度，结果仍与各自快照一致（无残留脏数据）', () => {
    const reused = createProjectedFlapShapeBuffers();
    for (const angle of [180, 0, 90, 12.5, 175]) {
      const snapshotShape = projectRoundedFlapShape(walletRect, foldLineY, angle, 16);
      projectRoundedFlapShapeInto(reused, walletRect, foldLineY, angle, 16);
      expect(reused.outlineBoundaries).toEqual(snapshotShape.outlineBoundaries);
      expect(reused.stripBoundaries).toEqual(snapshotShape.stripBoundaries);
    }
  });
});
