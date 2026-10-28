import { describe, expect, it } from 'vitest';
import { mcpParts } from '../../src/content/harness/mcp';
import { subagentParts } from '../../src/content/harness/subagents';
import { getProject } from '../../src/content/index';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { type ProjectScore, scoreProject } from '../../src/core/scoring';
import { createInitialState } from '../../src/core/state';
import { compare, seeds } from '../helpers/compare';
import { runHeadless } from '../helpers/headless';
import { strategies } from '../helpers/strategies';

/**
 * Harness の設計意図（企画書7章・13〜18章）を、コーポレートサイト制作の戦略シミュレーションで確かめる。
 * 担当はすべて「AI → 人間レビュー」にそろえ、AI Worker の Model と Harness だけを変える。
 */
const P = 'corporateSite';
const AGENT = 'agent';
const SEEDS = seeds(60);

/** 案件を始めて担当を決め、Model と部品を設定してから、納期の4倍まで進める */
function play(seed: string, modelId: string, parts: readonly string[]): ProjectScore {
  const start: Command = { type: 'StartProject', projectId: P };
  const started = reduce(createInitialState(seed), start).state;
  const setup: Command[] = [
    start,
    ...strategies.aiWithReview(P)(started),
    { type: 'SetModel', workerId: AGENT, modelId },
    ...parts.map((partId): Command => ({ type: 'EquipPart', workerId: AGENT, partId })),
  ];
  const { state } = runHeadless({
    seed,
    commands: setup.map((command) => ({ at: 0, command })),
    until: deadlineMinutes(getProject(P)) * 4,
  });
  // 装着できなかった部品があれば、比べている構成が意図と違う
  expect([...(state.harnesses[AGENT]?.parts ?? [])].sort()).toEqual([...parts].sort());
  const score = scoreProject(state, P);
  if (!score) throw new Error('案件が始まっていない');
  return score;
}

const fmt = (n: number) => Math.round(n).toLocaleString('ja-JP');
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** この案件に合わせた Harness：Skill・Hook・Eval と、仕事に必要な最小限の Tool と権限 */
const FITTED = [
  'skillFrontend',
  'skillReport',
  'skillPrReview',
  'hookFormatter',
  'hookLinter',
  'hookUnitTest',
  'evalUnitTest',
  'evalAcceptance',
  'evalUiReq',
  'mcpFilesystem',
  'mcpGit',
  'mdOverview',
  'permAcceptEdits',
];
const RULES = ['Formatter', 'Linter', 'UnitTest'];
const EVALS = ['evalUnitTest', 'evalAcceptance', 'evalUiReq', 'evalA11y', 'evalCodingRules'];
const MINIMAL_TOOLS = ['mcpFilesystem', 'mcpGit', 'mcpBrowser'];

describe('Harness のバランス（コーポレートサイト制作）', () => {
  it('高いモデルを買えば勝ちにならない：最上位モデル＋Harness なし ＜ 標準モデル＋適切な Harness（企画書7章）', () => {
    const r = compare(
      {
        frontier: (seed) => play(seed, 'frontier', []),
        standard: (seed) => play(seed, 'standard', []),
        harnessed: (seed) => play(seed, 'standard', FITTED),
      },
      SEEDS,
    );
    console.log(
      `[企画書7章] Profit/Person-Day：最上位モデル＋Harnessなし ${fmt(r.frontier.profitPerPersonDay)}` +
        ` vs 標準モデル＋適切なHarness ${fmt(r.harnessed.profitPerPersonDay)} 円/人日` +
        `（参考：標準モデル＋Harnessなし ${fmt(r.standard.profitPerPersonDay)}）` +
        ` / 人間時間 ${fmt(r.frontier.humanMinutes)} vs ${fmt(r.harnessed.humanMinutes)} 分` +
        ` / 手戻り率 ${pct(r.frontier.reworkRate)} vs ${pct(r.harnessed.reworkRate)}` +
        ` / AI費用 ${fmt(r.frontier.aiCost)} vs ${fmt(r.harnessed.aiCost)} 円・導入コスト ${fmt(r.harnessed.harnessCost)} 円`,
    );
    expect(r.harnessed.profitPerPersonDay).toBeGreaterThan(r.frontier.profitPerPersonDay);
    // 最上位モデルは Harness なしの標準モデルよりは強い（Model にも意味がある）
    expect(r.frontier.profitPerPersonDay).toBeGreaterThan(r.standard.profitPerPersonDay);
  });

  it('Hook ＞ お願い：同じルールでも Hook にした方が手戻り率が低い（企画書14章）', () => {
    const r = compare(
      {
        hook: (seed) =>
          play(
            seed,
            'standard',
            RULES.map((k) => `hook${k}`),
          ),
        request: (seed) =>
          play(
            seed,
            'standard',
            RULES.map((k) => `request${k}`),
          ),
        none: (seed) => play(seed, 'standard', []),
      },
      SEEDS,
    );
    console.log(
      `[企画書14章] 手戻り率：Hook ${pct(r.hook.reworkRate)} vs お願い ${pct(r.request.reworkRate)}` +
        `（参考：なし ${pct(r.none.reworkRate)}）/ Profit/Person-Day ${fmt(r.hook.profitPerPersonDay)} vs ${fmt(r.request.profitPerPersonDay)} 円/人日`,
    );
    expect(r.hook.reworkRate).toBeLessThan(r.request.reworkRate);
  });

  it('Eval で人間の介入間隔が伸びる（企画書18章）', () => {
    const r = compare(
      {
        withEval: (seed) => play(seed, 'standard', EVALS),
        noEval: (seed) => play(seed, 'standard', []),
      },
      SEEDS,
    );
    console.log(
      `[企画書18章] 人間の介入間隔：Eval あり ${r.withEval.interventionInterval.toFixed(1)} 分` +
        ` vs なし ${r.noEval.interventionInterval.toFixed(1)} 分` +
        `（介入 ${r.withEval.interventions.toFixed(1)} 回 vs ${r.noEval.interventions.toFixed(1)} 回・` +
        `手戻り率 ${pct(r.withEval.reworkRate)} vs ${pct(r.noEval.reworkRate)}）`,
    );
    expect(r.withEval.interventionInterval).toBeGreaterThan(r.noEval.interventionInterval);
  });

  it('Subagent は増やすほど強いわけではない：Subagent 数と成果は山型で、最適値は 2〜3（企画書15章）', () => {
    const counts = [1, 2, 3, 4, 5];
    const candidates = Object.fromEntries(
      counts.map((n) => [
        `n${n}`,
        (seed: string) =>
          play(
            seed,
            'standard',
            subagentParts.slice(0, n).map((p) => p.id),
          ),
      ]),
    );
    const r = compare(candidates, SEEDS);
    const profit = counts.map((n) => r[`n${n}`]?.profitPerPersonDay ?? 0);
    console.log(
      `[企画書15章] Subagent 数ごとの Profit/Person-Day：${counts
        .map((n, i) => `${n}体 ${fmt(profit[i] ?? 0)}`)
        .join(' / ')} 円/人日` +
        `（手戻り率 ${counts.map((n) => pct(r[`n${n}`]?.reworkRate ?? 0)).join(' / ')}・` +
        `AI費用 ${counts.map((n) => fmt(r[`n${n}`]?.aiCost ?? 0)).join(' / ')} 円）`,
    );
    const best = counts[profit.indexOf(Math.max(...profit))];
    expect([2, 3]).toContain(best);
    // 山型：最適値より少なくても多くても下がる
    expect(profit[0]).toBeLessThan(Math.max(...profit));
    expect(profit[4]).toBeLessThan(Math.max(...profit));
  });

  it('Tool は多ければ良いわけではない：全部入りは必要最小限より事故率が高い（企画書16章）', () => {
    const r = compare(
      {
        all: (seed) =>
          play(
            seed,
            'standard',
            mcpParts.map((p) => p.id),
          ),
        minimal: (seed) => play(seed, 'standard', MINIMAL_TOOLS),
      },
      SEEDS,
    );
    console.log(
      `[企画書16章] 事故率（AI の仕事1件あたり）：全部入り ${pct(r.all.accidentRate)} vs 必要最小限 ${pct(r.minimal.accidentRate)}` +
        ` / Profit/Person-Day ${fmt(r.all.profitPerPersonDay)} vs ${fmt(r.minimal.profitPerPersonDay)} 円/人日`,
    );
    expect(r.all.accidentRate).toBeGreaterThan(r.minimal.accidentRate);
    expect(r.minimal.profitPerPersonDay).toBeGreaterThan(r.all.profitPerPersonDay);
  });

  it('ルールは仕分けるほうが良い：全部 CLAUDE.md に詰めると長すぎて読み落とし、関係ない仕事で Noise になる（Phase 26）', () => {
    const cards = ['Overview', 'Coding', 'Design', 'Testing', 'Release', 'Learnings', 'OldSpec'];
    const sorted = ['mdOverview', ...cards.slice(1, -1).map((c) => `rule${c}`)];
    const r = compare(
      {
        allMd: (seed) =>
          play(
            seed,
            'standard',
            cards.map((c) => `md${c}`),
          ),
        sorted: (seed) => play(seed, 'standard', sorted),
        none: (seed) => play(seed, 'standard', []),
      },
      SEEDS,
    );
    console.log(
      `[Phase 26] Profit/Person-Day：全部 CLAUDE.md ${fmt(r.allMd.profitPerPersonDay)} vs 仕分け ${fmt(r.sorted.profitPerPersonDay)}` +
        `（参考：渡さない ${fmt(r.none.profitPerPersonDay)}）円/人日 / 手戻り率 ${pct(r.allMd.reworkRate)} vs ${pct(r.sorted.reworkRate)}`,
    );
    expect(r.sorted.profitPerPersonDay).toBeGreaterThan(r.allMd.profitPerPersonDay);
    expect(r.sorted.profitPerPersonDay).toBeGreaterThan(r.none.profitPerPersonDay);
  });

  it('全部の仕事に必要な「案件の概要とコマンド」は Rules より CLAUDE.md が正解（Rules に分けるほど良いわけではない）', () => {
    const r = compare(
      {
        md: (seed) => play(seed, 'standard', ['mdOverview']),
        rule: (seed) => play(seed, 'standard', ['ruleOverview']),
      },
      SEEDS,
    );
    console.log(
      `[Phase 26] 案件の概要：CLAUDE.md ${fmt(r.md.profitPerPersonDay)} vs Rules ${fmt(r.rule.profitPerPersonDay)} 円/人日` +
        ` / 人間時間 ${fmt(r.md.humanMinutes)} vs ${fmt(r.rule.humanMinutes)} 分`,
    );
    expect(r.md.humanMinutes).toBeLessThan(r.rule.humanMinutes);
    expect(r.md.profitPerPersonDay).toBeGreaterThan(r.rule.profitPerPersonDay);
  });

  it('worktree があれば Subagent どうしが衝突しない：多めの Subagent でも成果が落ちにくい（Phase 26）', () => {
    const four = subagentParts.slice(0, 4).map((p) => p.id);
    const r = compare(
      {
        plain: (seed) => play(seed, 'standard', four),
        worktree: (seed) => play(seed, 'standard', [...four, 'worktree']),
      },
      SEEDS,
    );
    console.log(
      `[Phase 26] Subagent 4体：worktree なし ${fmt(r.plain.profitPerPersonDay)} vs あり ${fmt(r.worktree.profitPerPersonDay)} 円/人日` +
        ` / 手戻り率 ${pct(r.plain.reworkRate)} vs ${pct(r.worktree.reworkRate)}`,
    );
    expect(r.worktree.profitPerPersonDay).toBeGreaterThan(r.plain.profitPerPersonDay);
  });
});
