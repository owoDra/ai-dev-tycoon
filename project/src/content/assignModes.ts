import { ja } from '../i18n/ja';
import { balance } from './balance';
import type { AssignModeDef, AssignModeId, ModePhase, Stage } from './types';

const { instructShare, reviewShare, evalShare, finalCheckShare, finalCheckCatch } = balance.assign;

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
    // 簡易 Eval：AI の自動テストが先に失敗を見つけて AI が直すので、人間は最後に軽く確かめるだけになる。
    // 自動テストが見つけられるのは機械で確かめられる失敗だけで（Task の種類で決まる）、軽い確認ではすり抜けた失敗の一部しか見つからない
    // （Harness の Eval 部品は、どのモードでも AI の作業の直後に検証する。core/taskFlow.ts）
    id: 'aiThenEval',
    name: ja.modes.aiThenEval,
    steps: [
      { actor: 'human', phase: 'instruct', effortShare: instructShare },
      { actor: 'ai', phase: 'work', effortShare: 1 },
      { actor: 'ai', phase: 'review', effortShare: evalShare },
      { actor: 'human', phase: 'review', effortShare: finalCheckShare, catchRate: finalCheckCatch },
    ],
    chains: false,
  },
  {
    // 前の Task も Agent Workflow なら、指示出しなしで続けて実行する。AssignWorkflow で複数の Task をまとめて任せられる
    id: 'agentWorkflow',
    name: ja.modes.agentWorkflow,
    steps: [
      { actor: 'human', phase: 'instruct', effortShare: instructShare, skipWhenChained: true },
      { actor: 'ai', phase: 'work', effortShare: 1 },
    ],
    chains: true,
  },
];

/** 工程がどのボトルネック集計単位に入るか。手戻り（人間）・修復（AI）・Eval の検証と修復は確認なのでレビュー側に数える */
export const stageOfPhase: Readonly<Record<ModePhase | 'rework' | 'repair' | 'eval' | 'evalRepair', Stage>> = {
  instruct: 'work',
  work: 'work',
  review: 'review',
  rework: 'review',
  repair: 'review',
  eval: 'review',
  evalRepair: 'review',
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
