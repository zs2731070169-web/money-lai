import { DEFAULT_SKIN_ID, PersistedGameStateV1 } from './game-state';

/**
 * 皮肤解锁（meta-progression 规格「皮肤解锁」）：
 * 按跨会话内部累计抽取张数的梯度解锁；累计值仅用于判定，不在界面展示数值。
 */

export interface SkinDefinition {
  id: string;
  /** 皮肤类型：钱包外观 / 纸币纹样 */
  kind: 'wallet' | 'bill';
  /** 解锁所需的累计抽取张数（0 = 默认款） */
  unlockAtDrawCount: number;
  /** 展示名（中文文案） */
  displayName: string;
}

export const SKIN_COLLECTION: SkinDefinition[] = [
  { id: 'wallet-classic', kind: 'wallet', unlockAtDrawCount: 0, displayName: '经典原色' },
  { id: 'bill-sage', kind: 'bill', unlockAtDrawCount: 100, displayName: '藕荷纸纹' },
  { id: 'wallet-caramel', kind: 'wallet', unlockAtDrawCount: 50, displayName: '焦糖棕' },
  { id: 'bill-amber', kind: 'bill', unlockAtDrawCount: 400, displayName: '琥珀纸纹' },
  { id: 'wallet-moss', kind: 'wallet', unlockAtDrawCount: 200, displayName: '苔绿' },
  { id: 'wallet-dusk', kind: 'wallet', unlockAtDrawCount: 600, displayName: '暮蓝' },
  { id: 'bill-porcelain', kind: 'bill', unlockAtDrawCount: 1200, displayName: '瓷青纸纹' },
  { id: 'wallet-berry', kind: 'wallet', unlockAtDrawCount: 1500, displayName: '莓粉' },
  { id: 'bill-aurum', kind: 'bill', unlockAtDrawCount: 5000, displayName: '鎏金纸纹' },
];

export interface SkinUnlockEvaluation {
  state: PersistedGameStateV1;
  /** 本次评估新解锁的皮肤（供非侵入轻提示消费） */
  newlyUnlocked: SkinDefinition[];
}

export function evaluateSkinUnlocks(state: PersistedGameStateV1): SkinUnlockEvaluation {
  const unlockedSkinIds = new Set(state.unlockedSkins);
  const newlyUnlocked: SkinDefinition[] = [];
  for (const skin of SKIN_COLLECTION) {
    // 累计值仅用于解锁判定；解锁不改任何计数（规格：皮肤切换不影响计数与判定）
    if (state.lifetimeDrawCount >= skin.unlockAtDrawCount && !unlockedSkinIds.has(skin.id)) {
      unlockedSkinIds.add(skin.id);
      newlyUnlocked.push(skin);
    }
  }
  if (newlyUnlocked.length === 0) {
    return { state, newlyUnlocked: [] };
  }
  return {
    state: { ...state, unlockedSkins: Array.from(unlockedSkinIds) },
    newlyUnlocked,
  };
}

export function switchActiveSkin(
  state: PersistedGameStateV1,
  skinId: string,
): PersistedGameStateV1 {
  // 仅已解锁皮肤可切换；未解锁/未知 id 时状态不变（静默拒绝）
  const skinDefinition = SKIN_COLLECTION.find((skin) => skin.id === skinId);
  if (!skinDefinition || !state.unlockedSkins.includes(skinId)) {
    return state;
  }
  // 分组双槽（grouped-skin-selection）：钱包皮换钱包槽；纸纹皮换纸币槽，
  // 再选已启用的纹样 = 恢复纸币面额原色（null）——两槽互不覆盖
  if (skinDefinition.kind === 'wallet') {
    return { ...state, activeWalletSkin: skinId };
  }
  return {
    ...state,
    activeBillSkin: state.activeBillSkin === skinId ? null : skinId,
  };
}

export function isSkinUnlocked(state: PersistedGameStateV1, skinId: string): boolean {
  return state.unlockedSkins.includes(skinId);
}

export { DEFAULT_SKIN_ID };
