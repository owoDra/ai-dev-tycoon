import { describe, expect, it } from 'vitest';
import { getProject, getTask } from '../../src/content/index';
import type { AssignModeId } from '../../src/content/types';
import { stageTimes } from '../../src/core/bottleneck';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { createInitialState } from '../../src/core/state';
import { seeds } from '../helpers/compare';
import { runHeadless } from '../helpers/headless';

/**
 * ボトルネックの移動（企画書20章）を、SaaS の新機能追加の戦略シミュレーションで確かめる。
 * 実装を AI 化 → QA がボトルネック → QA を AI 化 → 人間のレビューがボトルネック → Eval を導入 → 全工程が短くなる。
 * 工程の時間は core の stageTimes（待ち時間を含むリードタイム）を seed ごとに求めて平均し、最大の工程をボトルネックとする。
 */
const P = 'saasFeature';
const AGENT = 'agent';
const SEEDS = seeds(40);
/** 人間の作業の担当（同じ人に仕事が重なって待たないように分ける） */
const HUMAN: Readonly<Record<string, string>> = {
  spec: 'sato',
  api: 'suzuki',
  ui: 'sato',
  migration: 'sato',
  helpDoc: 'suzuki',
  qa: 'suzuki',
  release: 'sato',
};

interface Plan {
  readonly name: string;
  readonly modes: Readonly<Record<string, AssignModeId>>;
  readonly parts: readonly string[];
}

const PLANS: readonly Plan[] = [
  { name: '人間だけ', modes: {}, parts: [] },
  {
    name: '実装を AI 化',
    modes: { api: 'aiThenHumanReview', ui: 'aiThenHumanReview', migration: 'aiThenHumanReview' },
    parts: [],
  },
  {
    name: 'QA も AI 化',
    modes: {
      api: 'aiThenHumanReview',
      ui: 'aiThenHumanReview',
      migration: 'aiThenHumanReview',
      qa: 'aiThenHumanReview',
    },
    parts: [],
  },
  {
    name: 'Eval を導入',
    modes: { api: 'aiThenEval', ui: 'aiThenEval', migration: 'aiThenEval', qa: 'aiThenEval' },
    parts: ['evalUnitTest', 'evalAcceptance'],
  },
];

/** 工程のキー（Task / 作業・レビュー）ごとの、seed 平均の時間（分） */
function stageAverages(plan: Plan): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const seed of SEEDS) {
    const commands: Command[] = [{ type: 'StartProject', projectId: P }];
    for (const task of getProject(P).tasks) {
      const mode = plan.modes[task.id] ?? 'human';
      const workerId = mode === 'human' ? (HUMAN[task.id] ?? 'sato') : AGENT;
      commands.push({ type: 'AssignTask', projectId: P, taskId: task.id, mode, workerId });
    }
    for (const partId of plan.parts) commands.push({ type: 'EquipPart', workerId: AGENT, partId });
    const started = commands.reduce((s, c) => reduce(s, c).state, createInitialState(seed));
    expect(started.harnesses[AGENT]?.parts ?? []).toEqual(plan.parts);
    const { state } = runHeadless({ seed, initial: started, until: deadlineMinutes(getProject(P)) * 4 });
    expect(state.projects[P]?.completedAt).not.toBeNull();
    for (const s of stageTimes(state, P)) {
      const key = `${s.ref.taskId}/${s.ref.stage}`;
      sums[key] = (sums[key] ?? 0) + s.minutes / SEEDS.length;
    }
  }
  return sums;
}

const worst = (times: Record<string, number>) =>
  Object.entries(times).reduce((a, b) => (b[1] > a[1] ? b : a), ['', Number.NEGATIVE_INFINITY] as [string, number]);

const label = (key: string) => {
  const [taskId = '', stage] = key.split('/');
  const name = getTask(P, taskId).name;
  return stage === 'review' ? `${name}のレビュー` : name;
};
const fmt = (m: number) => (m >= 60 ? `${(m / 60).toFixed(1)}h` : `${Math.round(m)}m`);

describe('ボトルネックの移動（企画書20章・SaaS の新機能追加）', () => {
  it('実装を AI 化 → QA → QA を AI 化 → 人間のレビュー → Eval を導入 → 全工程が短くなる、の順にボトルネックが移る', () => {
    const results = PLANS.map((plan) => ({ plan, times: stageAverages(plan) }));
    const keys = ['api/work', 'ui/work', 'qa/work', 'api/review', 'ui/review', 'qa/review', 'spec/work'];
    for (const { plan, times } of results) {
      const [key, minutes] = worst(times);
      console.log(
        `[企画書20章] ${plan.name}：ボトルネック ${label(key)} ${fmt(minutes)} ／ ` +
          keys.map((k) => `${label(k)} ${fmt(times[k] ?? 0)}`).join(' / '),
      );
    }
    const [human, aiImpl, aiQa, withEval] = results.map((r) => r.times);
    if (!human || !aiImpl || !aiQa || !withEval) throw new Error('段階が足りない');

    // 最初は実装（人間で8時間）
    expect(worst(human)[0]).toBe('api/work');
    // 実装を AI 化すると、実装は数十分になり、後ろの人間の工程（QA か、AI の成果物のレビュー）がボトルネックになる。
    // 人間は担当を掛け持ちすると遅くなる（core/formulas.ts の multitaskShare）ので、QA と重なったレビューが詰まることもある
    expect(aiImpl['api/work']).toBeLessThan((human['api/work'] ?? 0) / 5);
    expect(['qa/work', 'api/review']).toContain(worst(aiImpl)[0]);
    // QA も AI 化すると、QA は短くなり、人間のレビューがボトルネックになる
    expect(aiQa['qa/work']).toBeLessThan((aiImpl['qa/work'] ?? 0) / 5);
    expect(worst(aiQa)[0]).toBe('api/review');
    // Eval を導入すると、実装・QA・レビューのどれもが短くなり、ボトルネック自体も小さくなる
    for (const k of ['api/work', 'ui/work', 'qa/work', 'api/review', 'ui/review', 'qa/review']) {
      expect(withEval[k], k).toBeLessThan(aiQa[k] ?? 0);
    }
    expect(withEval['api/review']).toBeLessThan((aiQa['api/review'] ?? 0) / 3);
    expect(worst(withEval)[0]).not.toMatch(/\/review$/);
    expect(worst(withEval)[1]).toBeLessThan(worst(aiQa)[1]);
  });
});
