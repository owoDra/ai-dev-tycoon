import { ja } from '../i18n/ja';
import { balance } from './balance';
import type { AssignModeDef, AssignModeId, ModePhase, Stage } from './types';

const { instructShare, reviewShare, judgementShare } = balance.assign;

/** 担当モード（企画書5章）。並び順は UI の選択肢の順 */
export const assignModes: readonly AssignModeDef[] = [
  {
    id: 'human',
    name: ja.modes.human,
    steps: [{ actor: 'human', phase: 'work', effortShare: 1 }],
    chains: false,
  },
  {
    id: 'ai',
    name: ja.modes.ai,
    steps: [
      { actor: 'human', phase: 'instruct', effortShare: instructShare },
      { actor: 'ai', phase: 'work', effortShare: 1 },
    ],
    chains: false,
  },
  {
    id: 'aiThenHumanReview',
    name: ja.modes.aiThenHumanReview,
    steps: [
      { actor: 'human', phase: 'instruct', effortShare: instructShare },
      { actor: 'ai', phase: 'work', effortShare: 1 },
      { actor: 'human', phase: 'review', effortShare: reviewShare },
    ],
    chains: false,
  },
  {
    id: 'humanThenAi',
    name: ja.modes.humanThenAi,
    steps: [
      { actor: 'human', phase: 'work', effortShare: judgementShare },
      { actor: 'ai', phase: 'work', effortShare: 1 - judgementShare },
    ],
    chains: false,
  },
  {
    // 最小版：前の Task も Agent Workflow なら、指示出しなしで続けて実行する（Phase 11 で拡張する）
    id: 'agentWorkflow',
    name: ja.modes.agentWorkflow,
    steps: [
      { actor: 'human', phase: 'instruct', effortShare: instructShare, skipWhenChained: true },
      { actor: 'ai', phase: 'work', effortShare: 1 },
    ],
    chains: true,
  },
];

/** 工程がどのボトルネック集計単位に入るか。手戻りはレビューで見つかるのでレビュー側に数える */
export const stageOfPhase: Readonly<Record<ModePhase | 'rework', Stage>> = {
  instruct: 'work',
  work: 'work',
  review: 'review',
  rework: 'review',
};

export function getAssignMode(id: AssignModeId): AssignModeDef {
  const mode = assignModes.find((m) => m.id === id);
  if (!mode) throw new Error(`未定義の担当モード: ${id}`);
  return mode;
}

/** AI が関わるモードでは、AssignTask の workerId に AI Worker を指定する（人間の工程は空いている人が担う） */
export function primaryActor(mode: AssignModeDef): 'human' | 'ai' {
  return mode.steps.some((s) => s.actor === 'ai') ? 'ai' : 'human';
}
