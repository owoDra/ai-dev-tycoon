import type { HudItemId } from './look/layout';
import type { AssignModeId, FeatureId, ModeFeatureId, UnlockDef } from './types';

/**
 * 機能の解放（企画書50章「必要になる前に説明しない」）。条件を満たした時点で core/unlocks.ts が解放し、
 * FeatureUnlocked を出す（Tier 2 の演出と「NEW」バッジ）。
 * 解放の進み具合を持ち越すのは Phase 13（キャンペーン・セーブ）。それまでは、チュートリアルは start の機能だけで始まり、
 * それ以外のプレイはすべて解放済みで始まる。
 */
export const unlockDefs: readonly UnlockDef[] = [
  { id: 'human', feature: 'mode:human', when: { type: 'start' }, message: 'basic' },
  { id: 'ai', feature: 'mode:ai', when: { type: 'start' }, message: 'basic' },
  { id: 'speed', feature: 'dock:speed', when: { type: 'tasksStarted', count: 1 }, message: 'speed' },
  {
    id: 'utilization',
    feature: 'dock:utilization',
    when: { type: 'tasksCompleted', count: 1 },
    message: 'utilization',
  },
  // AI のミスで品質が落ちた後に、確かめる手段を渡す
  { id: 'review', feature: 'mode:aiThenHumanReview', when: { type: 'defectsEscaped', count: 1 }, message: 'review' },
  // レビューを一度やって「毎回確認するのは大変」と感じた後に、自動テストを渡す
  {
    id: 'eval',
    feature: 'mode:aiThenEval',
    when: { type: 'modeCompleted', mode: 'aiThenHumanReview', count: 1 },
    message: 'eval',
  },
  {
    id: 'humanThenAi',
    feature: 'mode:humanThenAi',
    when: { type: 'projectsCompleted', count: 1 },
    message: 'advanced',
  },
  {
    id: 'agentWorkflow',
    feature: 'mode:agentWorkflow',
    when: { type: 'unlocked', feature: 'mode:humanThenAi' },
    message: 'advanced',
  },
  { id: 'problems', feature: 'problems', when: { type: 'projectsCompleted', count: 1 }, message: 'problems' },
];

export const modeFeature = (mode: AssignModeId): ModeFeatureId => `mode:${mode}`;

/** ドックの項目のうち、解放されるまで出さないもの（載っていない項目は常に出す） */
export const dockFeature: Partial<Record<HudItemId, FeatureId>> = {
  speed: 'dock:speed',
  utilization: 'dock:utilization',
  problems: 'problems',
};

/** すべての機能（解放の定義の順） */
export const allFeatures: readonly FeatureId[] = unlockDefs.map((u) => u.feature);
