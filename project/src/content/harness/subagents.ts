import { ja } from '../../i18n/ja';
import type { HarnessPartDef } from '../types';

const n = ja.harness.parts;

/** Subagent の共通の値。分担先が1つ増えるごとに並列化・専門化で強くなるが、AI の利用量も増える */
const base = {
  category: 'subagent',
  installCost: 10_000,
  runningCost: 0,
  enforcement: 'system',
  unlock: 'harness:subagent',
  modifiers: { success: 0.12, speed: 1.15 },
  burden: { aiCost: 1.1 },
  appliesTo: ['planning', 'research', 'design', 'content', 'code', 'test', 'release'],
} as const;

/**
 * Subagents（企画書15章）。Main から Research・Code・QA などへ分担する。
 * 分担先どうしの調整コストは組の数（Subagent 数の2乗）で増える（balance.harness.pairs.subagent）ので、
 * 増やすほど強いわけではない
 */
export const subagentParts: readonly HarnessPartDef[] = [
  { ...base, id: 'subResearch', name: n.subResearch },
  { ...base, id: 'subCode', name: n.subCode },
  { ...base, id: 'subQa', name: n.subQa },
  { ...base, id: 'subReview', name: n.subReview },
  { ...base, id: 'subDocs', name: n.subDocs },
];

/**
 * worktree。Subagent ごとに別の作業場所（git worktree）で作業するので、分担先どうしが同じファイルで衝突しない。
 * Subagent の組ごとの調整コスト（balance.harness.pairs.subagent）の一部を打ち消す。Subagent がいなければ何も起きない
 */
export const worktreeParts: readonly HarnessPartDef[] = [
  {
    id: 'worktree',
    category: 'subagent',
    name: n.worktree,
    installCost: 15_000,
    runningCost: 0,
    modifiers: {},
    burden: {},
    pairRelief: { subagent: 0.6 },
    appliesTo: [],
    enforcement: 'system',
    unlock: 'harness:subagent',
  },
];
