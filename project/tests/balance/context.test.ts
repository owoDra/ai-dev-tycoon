import { describe, expect, it } from 'vitest';
import { handoffItems } from '../../src/content/documents';
import { getProject } from '../../src/content/index';
import type { ContextFeed } from '../../src/content/types';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { type ProjectScore, scoreProject } from '../../src/core/scoring';
import { createInitialState, type GameState } from '../../src/core/state';
import { compare, seeds } from '../helpers/compare';
import { runHeadless } from '../helpers/headless';
import { strategies } from '../helpers/strategies';

/**
 * Context の設計意図（企画書10〜11章）を、決済画面の修正の戦略シミュレーションで確かめる。
 * 担当はすべて「AI → 人間レビュー」にそろえ、資料の渡し方と Session の扱いだけを変える。
 */
const P = 'paymentFix';
const AGENT = 'agent';
const SEEDS = seeds(40);
const horizon = () => deadlineMinutes(getProject(P)) * 4;

/** 案件を始めて担当を決め、資料の渡し方を決めた状態 */
function started(seed: string, feed: ContextFeed): GameState {
  let s = createInitialState(seed);
  s = reduce(s, { type: 'StartProject', projectId: P }).state;
  for (const c of strategies.aiWithReview(P)(s)) s = reduce(s, c).state;
  return reduce(s, { type: 'SetContextFeed', workerId: AGENT, feed }).state;
}

/** 1分ずつ進め、until を満たした時点で commands を適用してから、納期の4倍まで進める */
function play(
  seed: string,
  feed: ContextFeed,
  at?: { readonly until: (s: GameState) => boolean; readonly commands: readonly Command[] },
): ProjectScore {
  let state = started(seed, feed);
  if (at) {
    while (!at.until(state) && state.clock < horizon()) {
      state = runHeadless({ seed, initial: state, until: state.clock + 1 }).state;
    }
    for (const c of at.commands) state = reduce(state, c).state;
  }
  state = runHeadless({ seed, initial: state, until: horizon() }).state;
  const score = scoreProject(state, P);
  if (!score) throw new Error('案件が始まっていない');
  return score;
}

const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');

describe('Context のバランス（決済画面の修正）', () => {
  it('「必要な資料だけ」は「すべての資料」より Profit / Person-Day が高い（企画書10章）', () => {
    const r = compare(
      {
        needed: (seed) => play(seed, { mode: 'needed' }),
        all: (seed) => play(seed, { mode: 'all' }),
      },
      SEEDS,
    );
    console.log(
      `[企画書10章] Profit/Person-Day：必要な資料だけ ${fmt(r.needed.profitPerPersonDay)} 円/人日` +
        ` vs すべての資料 ${fmt(r.all.profitPerPersonDay)} 円/人日` +
        `（品質 ${r.needed.quality.toFixed(3)} vs ${r.all.quality.toFixed(3)}・AI費用 ${fmt(r.needed.aiCost)} vs ${fmt(r.all.aiCost)} 円）`,
    );
    expect(r.needed.profitPerPersonDay).toBeGreaterThan(r.all.profitPerPersonDay);
    expect(r.needed.aiCost).toBeLessThan(r.all.aiCost);
  });

  it('長い Session では、Handoff 付きの New Session が、そのまま続けるより・Handoff なしの Reset より強い（企画書11章）', () => {
    // 修正（最も長い Task）を終えた時点で Session は長くなっている。そこで Reset するかを選ぶ
    const fixDone = (s: GameState) => s.projects[P]?.tasks.fix?.status === 'done';
    const reset = (items: Extract<Command, { type: 'SetHandoff' }>['items']): Command[] => [
      { type: 'SetHandoff', workerId: AGENT, items },
      { type: 'NewSession', workerId: AGENT },
    ];
    const r = compare(
      {
        handoff: (seed) => play(seed, { mode: 'needed' }, { until: fixDone, commands: reset(handoffItems) }),
        keep: (seed) => play(seed, { mode: 'needed' }, { until: fixDone, commands: [] }),
        noHandoff: (seed) => play(seed, { mode: 'needed' }, { until: fixDone, commands: reset([]) }),
      },
      SEEDS,
    );
    console.log(
      `[企画書11章] Profit/Person-Day：Handoff付きReset ${fmt(r.handoff.profitPerPersonDay)}` +
        ` vs 継続 ${fmt(r.keep.profitPerPersonDay)} vs Handoffなし ${fmt(r.noHandoff.profitPerPersonDay)} 円/人日`,
    );
    expect(r.handoff.profitPerPersonDay).toBeGreaterThan(r.keep.profitPerPersonDay);
    expect(r.handoff.profitPerPersonDay).toBeGreaterThan(r.noHandoff.profitPerPersonDay);
  });
});
