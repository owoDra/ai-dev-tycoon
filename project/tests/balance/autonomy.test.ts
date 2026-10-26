import { describe, expect, it } from 'vitest';
import { getProject } from '../../src/content/index';
import { autonomySummary } from '../../src/core/autonomy';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { createInitialState } from '../../src/core/state';
import { compare, seeds } from '../helpers/compare';
import { runHeadless } from '../helpers/headless';
import { strategies } from '../helpers/strategies';

/**
 * 最大の報酬（企画書23章「Human-Free Time」）。Hook と Eval を導入して Workflow にまとめると、
 * 人間の介入なしで AI が処理を続けられる時間が大きく伸びる（every 8 min → after 74 min）。
 * コーポレートサイト制作で、未導入（どの Task も AI → 人間レビュー）と導入後（Hook と Eval を付け、全 Task を Workflow にまとめる）を比べる。
 */
const P = 'corporateSite';
const AGENT = 'agent';
const SEEDS = seeds(40);
const HOOKS = ['hookFormatter', 'hookLinter', 'hookUnitTest'];
const EVALS = ['evalUnitTest', 'evalAcceptance', 'evalUiReq', 'evalA11y'];

function play(seed: string, harnessed: boolean) {
  const start: Command = { type: 'StartProject', projectId: P };
  const started = reduce(createInitialState(seed), start).state;
  const taskIds = getProject(P).tasks.map((t) => t.id);
  const setup: Command[] = harnessed
    ? [
        { type: 'AssignWorkflow', projectId: P, taskIds, workerId: AGENT },
        ...[...HOOKS, ...EVALS].map((partId): Command => ({ type: 'EquipPart', workerId: AGENT, partId })),
      ]
    : strategies.aiWithReview(P)(started);
  const initial = setup.reduce((s, c) => reduce(s, c).state, started);
  if (harnessed) expect(initial.harnesses[AGENT]?.parts).toEqual([...HOOKS, ...EVALS]);
  const { state, events } = runHeadless({ seed, initial, until: deadlineMinutes(getProject(P)) * 4 });
  expect(state.projects[P]?.completedAt).not.toBeNull();
  const a = autonomySummary(state, AGENT);
  return {
    average: a.average,
    longest: a.longest,
    milestones: events.filter((e) => e.type === 'AutonomyMilestone').length,
  };
}

describe('Autonomy Streak（企画書23章・コーポレートサイト制作）', () => {
  it('Hook と Eval を導入した構成は、未導入の構成より人間の介入間隔が5倍以上長い（8分 → 74分）', () => {
    const r = compare({ before: (s) => play(s, false), after: (s) => play(s, true) }, SEEDS);
    console.log(
      `[企画書23章] 人間の介入間隔（平均）：未導入 ${r.before.average.toFixed(1)} 分 → Hook＋Eval 導入 ${r.after.average.toFixed(1)} 分` +
        `（${(r.after.average / r.before.average).toFixed(1)} 倍）／ 最長 ${r.before.longest.toFixed(1)} 分 → ${r.after.longest.toFixed(1)} 分` +
        ` ／ AUTONOMY STREAK の節目 ${r.before.milestones.toFixed(1)} 回 → ${r.after.milestones.toFixed(1)} 回`,
    );
    expect(r.after.average).toBeGreaterThanOrEqual(r.before.average * 5);
    // 導入後は AUTONOMY STREAK の節目（30分）に届き、未導入では届かない
    expect(r.after.milestones).toBeGreaterThanOrEqual(1);
    expect(r.before.milestones).toBe(0);
  });
});
