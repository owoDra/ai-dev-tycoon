import { getAssignMode } from '../content/assignModes';
import { getAiWorker, getProject } from '../content/index';
import type { AssignModeDef, TaskDef } from '../content/types';
import { contextApplies } from './context';
import { averageSkill, expectTask } from './expectation';
import { escapedDefectCost, escapedFixMinutes, escapedQuality } from './formulas';
import { createSession, type GameState, type SessionRun, type TaskSetup } from './state';

/*
 * 改善効果の寄与（企画書60章「一番効いた改善」「最大の無駄」）。
 * AI が作業したときに Task へ記録した構成（TaskRun.setup）から、構成の要素ごとに人間時間・コスト・品質への影響を見積もる。
 * 見積もりはシミュレーションと同じ式の期待値（core/expectation.ts）で、要素を1つずつ入れていったときの差を、
 * 入れる順を前から・後ろからの2通りで平均する（どちらの順でも差の合計は全体の差分に一致する）。
 *
 * 比べる基準（どの要素も無い構成）：担当は同じまま、AI Worker の既定の Model で部品なし、
 * Session は「必要な資料だけ」を渡した履歴のない状態。AI に任せたこと自体は要素に含めない（結果画面の第1段の「人間だけの見込み」との比較で示す）。
 */

/** 寄与を見る構成の要素 */
export type FactorRef =
  | { readonly kind: 'part'; readonly partId: string }
  | { readonly kind: 'model'; readonly modelId: string }
  /** 資料の渡し方と Session の履歴（「必要な資料だけ・履歴なし」との差） */
  | { readonly kind: 'context' };

/** 構成の影響。要素があるときの値 − 無いときの値（人間時間が負なら削減、コストが負なら節約） */
export interface Impact {
  /** 人間の時間（分）。指示出し・確認・手戻りと、見逃した失敗を納品後に直す時間 */
  readonly humanMinutes: number;
  /** 人件費以外の費用（円）。AI の費用・事故の損害・見逃した失敗の損害 */
  readonly cost: number;
  /** 品質（0〜1） */
  readonly quality: number;
}

export interface FactorImpact {
  /** 要素を区別するキー（part:<id> / model:<id> / context） */
  readonly key: string;
  readonly ref: FactorRef;
  readonly impact: Impact;
}

export interface TaskAttribution {
  readonly taskId: string;
  /** 記録した構成 − 基準の構成 */
  readonly total: Impact;
  readonly factors: readonly FactorImpact[];
}

export interface ProjectAttribution {
  readonly total: Impact;
  /** 要素ごとの寄与（Task をまたいで合計。並びは最初に現れた順） */
  readonly factors: readonly FactorImpact[];
  readonly tasks: readonly TaskAttribution[];
}

export const ZERO_IMPACT: Impact = { humanMinutes: 0, cost: 0, quality: 0 };

export const addImpact = (a: Impact, b: Impact, k = 1): Impact => ({
  humanMinutes: a.humanMinutes + b.humanMinutes * k,
  cost: a.cost + b.cost * k,
  quality: a.quality + b.quality * k,
});

/** 基準の Session：「必要な資料だけ」を渡し、履歴も引き継ぎもない */
export function idealSession(): SessionRun {
  return { ...createSession(), feed: { mode: 'needed' } };
}

export function factorKey(ref: FactorRef): string {
  if (ref.kind === 'part') return `part:${ref.partId}`;
  if (ref.kind === 'model') return `model:${ref.modelId}`;
  return 'context';
}

const sameSession = (a: SessionRun, b: SessionRun) => JSON.stringify(a) === JSON.stringify(b);

/** 記録した構成の要素。基準と同じもの（既定の Model・必要な資料だけの Session）は含めない */
export function setupFactors(projectId: string, workerId: string, setup: TaskSetup): FactorRef[] {
  const refs: FactorRef[] = setup.harness.parts.map((partId) => ({ kind: 'part', partId }));
  if (setup.harness.modelId !== getAiWorker(workerId).modelId)
    refs.push({ kind: 'model', modelId: setup.harness.modelId });
  if (contextApplies(projectId) && !sameSession(setup.session, idealSession())) refs.push({ kind: 'context' });
  return refs;
}

/** 要素の一部（on）だけを入れた構成を、AI Worker に当てはめた state。発生中の事件は除く */
export function applySetup(
  state: GameState,
  workerId: string,
  setup: TaskSetup,
  on: (ref: FactorRef) => boolean,
): GameState {
  const parts = setup.harness.parts.filter((partId) => on({ kind: 'part', partId }));
  const model = { kind: 'model', modelId: setup.harness.modelId } as const;
  const modelId = on(model) ? setup.harness.modelId : getAiWorker(workerId).modelId;
  const session = on({ kind: 'context' }) ? setup.session : idealSession();
  return {
    ...state,
    harnesses: { ...state.harnesses, [workerId]: { modelId, parts } },
    sessions: { ...state.sessions, [workerId]: session },
    incidents: [],
  };
}

/** Task をモードで処理したときの影響の見込み（人間時間・費用・品質） */
export function expectedImpact(
  state: GameState,
  projectId: string,
  task: TaskDef,
  mode: AssignModeDef,
  workerId: string,
  skill: number,
): Impact {
  const e = expectTask(state, projectId, task, mode, workerId, skill);
  return {
    humanMinutes: e.humanMinutes + e.pEscape * escapedFixMinutes(task),
    cost: e.aiCost + e.accidentCost + e.pEscape * escapedDefectCost(task),
    quality: 1 - e.pEscape * (1 - escapedQuality(task)),
  };
}

/** 1つの Task の寄与。AI が作業していない（構成の記録がない）Task は null */
export function attributeTask(state: GameState, projectId: string, taskId: string): TaskAttribution | null {
  const run = state.projects[projectId]?.tasks[taskId];
  if (!run?.setup || !run.assignment) return null;
  const { setup } = run;
  const workerId = run.assignment.workerId;
  const task = getProject(projectId).tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const mode = getAssignMode(run.assignment.mode);
  const skill = averageSkill();
  const refs = setupFactors(projectId, workerId, setup);
  const keys = refs.map(factorKey);
  const measure = (on: ReadonlySet<string>) =>
    expectedImpact(
      applySetup(state, workerId, setup, (ref) => on.has(factorKey(ref))),
      projectId,
      task,
      mode,
      workerId,
      skill,
    );

  const share = new Map<string, Impact>(keys.map((k) => [k, ZERO_IMPACT]));
  const orders = [keys, [...keys].reverse()];
  for (const order of orders) {
    const on = new Set<string>();
    let prev = measure(on);
    for (const key of order) {
      on.add(key);
      const cur = measure(on);
      share.set(key, addImpact(share.get(key) ?? ZERO_IMPACT, addImpact(cur, prev, -1), 1 / orders.length));
      prev = cur;
    }
  }
  const total = addImpact(measure(new Set(keys)), measure(new Set()), -1);
  return {
    taskId,
    total,
    factors: refs.map((ref, i) => ({ key: keys[i] ?? '', ref, impact: share.get(keys[i] ?? '') ?? ZERO_IMPACT })),
  };
}

/**
 * 案件の寄与。AI が作業した Task ごとに見積もり、要素ごとに合計する（記録のコストを抑えるため Task 単位で集計する）。
 * 品質は Task の作業量による加重平均への寄与にする
 */
export function attributeProject(state: GameState, projectId: string): ProjectAttribution {
  const def = getProject(projectId);
  const effortSum = def.tasks.reduce((sum, t) => sum + t.effort, 0);
  const tasks: TaskAttribution[] = [];
  const merged = new Map<string, FactorImpact>();
  let total = ZERO_IMPACT;
  const weighted = (impact: Impact, effort: number): Impact => ({
    ...impact,
    quality: effortSum > 0 ? (impact.quality * effort) / effortSum : 0,
  });
  for (const task of def.tasks) {
    const a = attributeTask(state, projectId, task.id);
    if (!a) continue;
    tasks.push(a);
    total = addImpact(total, weighted(a.total, task.effort));
    for (const f of a.factors) {
      const prev = merged.get(f.key);
      const impact = addImpact(prev?.impact ?? ZERO_IMPACT, weighted(f.impact, task.effort));
      merged.set(f.key, { key: f.key, ref: f.ref, impact });
    }
  }
  return { total, factors: [...merged.values()], tasks };
}
