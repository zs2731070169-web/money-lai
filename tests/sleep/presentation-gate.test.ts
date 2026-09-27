import { describe, expect, it } from 'vitest';
import {
  ALL_PRESENTABLE_FEEDBACK_TYPES,
  PresentationHapticTier,
  resolvePresentationDecision,
  resolveSessionHapticTier,
} from '../../src/core/sleep/presentation-gate';

/** 夜间呈现门控单测（sleep-mode 规格「夜间反馈静默」，任务 1.4）——穷举全部反馈类型。 */

const ALL_HAPTIC_TIERS: PresentationHapticTier[] = ['light', 'medium', 'heavy'];

describe('presentation-gate 夜间反馈静默', () => {
  it('穷举：日间全部反馈照常呈现且触觉原样', () => {
    for (const feedback of ALL_PRESENTABLE_FEEDBACK_TYPES) {
      for (const tier of ALL_HAPTIC_TIERS) {
        const decision = resolvePresentationDecision(feedback, false, tier);
        expect(decision.present).toBe(true);
        expect(decision.hapticTier).toBe(tier);
      }
    }
  });

  it('穷举：夜间四类呈现反馈全静默、无触觉', () => {
    expect(ALL_PRESENTABLE_FEEDBACK_TYPES).toHaveLength(4);
    for (const feedback of ALL_PRESENTABLE_FEEDBACK_TYPES) {
      const decision = resolvePresentationDecision(feedback, true, 'heavy');
      expect(decision.present).toBe(false);
      expect(decision.hapticTier).toBeNull();
    }
  });

  it('常规交互触觉：日间原样、夜间一律降至最轻档', () => {
    for (const tier of ALL_HAPTIC_TIERS) {
      expect(resolveSessionHapticTier(tier, false)).toBe(tier);
      expect(resolveSessionHapticTier(tier, true)).toBe('light');
    }
  });
});
