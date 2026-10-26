import { describe, expect, it } from 'vitest';
import { activeLayers } from '../../src/audio/music/intensity';
import { balance } from '../../src/content/balance';
import { fxTable } from '../../src/content/fx';
import { getProject } from '../../src/content/index';
import { defaultFeel } from '../../src/content/look/feel';
import { songs } from '../../src/content/music';
import { type Command, reduce } from '../../src/core/commands';
import { deadlineMinutes } from '../../src/core/formulas';
import { createInitialState } from '../../src/core/state';
import { createFxDirector } from '../../src/fx/director';
import { ja } from '../../src/i18n/ja';
import { streakActive } from '../../src/view/audio';
import { fxSignals } from '../../src/view/fx';
import { streakView } from '../../src/view/hud';
import { runHeadless } from '../helpers/headless';

const P = 'corporateSite';

/** Hook と Eval を付けて全 Task を Workflow にまとめた構成（tests/balance/autonomy.test.ts と同じ） */
function harnessedRun(seed: string) {
  let s = reduce(createInitialState(seed), { type: 'StartProject', projectId: P }).state;
  const setup: Command[] = [
    { type: 'AssignWorkflow', projectId: P, taskIds: getProject(P).tasks.map((t) => t.id), workerId: 'agent' },
    ...['hookUnitTest', 'evalUnitTest', 'evalAcceptance'].map(
      (partId): Command => ({ type: 'EquipPart', workerId: 'agent', partId }),
    ),
  ];
  for (const c of setup) s = reduce(s, c).state;
  return runHeadless({ seed, initial: s, until: deadlineMinutes(getProject(P)) * 4 });
}

describe('AUTONOMY STREAK の演出（企画書23章・43章）', () => {
  it('ゲームの中で Streak が節目を越えると、Tier 4 の「AUTONOMY STREAK n MIN」が起動する', () => {
    const { events } = harnessedRun('streak-fx');
    const milestone = events.find((e) => e.type === 'AutonomyMilestone');
    expect(milestone).toMatchObject({ type: 'AutonomyMilestone', minutes: balance.autonomy.milestones[0] });

    const signals = fxSignals(events, { projectId: P, bottleneckEntity: null });
    expect(signals).toContainEqual({ kind: 'autonomyStreak', entityId: null, amount: balance.autonomy.milestones[0] });

    const director = createFxDirector({ now: () => 0, feel: () => defaultFeel, reduced: () => false });
    const started = director.handle([{ kind: 'autonomyStreak', entityId: null, amount: 74 }]).started;
    expect(started.map((c) => [c.id, c.tier])).toEqual([['autonomyStreak', 4]]);
    expect(started[0]?.parts).toEqual(expect.arrayContaining(['bigType', 'bigNumber', 'highFive', 'confetti']));
    expect(ja.fx.labels.autonomyStreak).toBe('AUTONOMY STREAK');
    expect(ja.fx.streakMinutes(74)).toBe('74 MIN');
  });

  it('動きを減らす設定ではハイタッチや紙吹雪なしで、文字と数字をフェードで出す', () => {
    const def = fxTable.find((d) => d.id === 'autonomyStreak');
    expect(def?.reducedAlternative).toEqual(expect.arrayContaining(['fadeBigType', 'fadeBigNumber']));
    expect(def?.reducedAlternative).not.toContain('highFive');
  });

  it('HUD の Streak メーターは節目を越えると燃え上がり、BGM にレイヤーが足される', () => {
    const first = balance.autonomy.milestones[0] ?? 0;
    const at = (streak: number) => ({
      ...createInitialState('m'),
      autonomy: { agent: { streak, milestones: 0, intervals: 0, intervalTotal: 0, longest: streak } },
    });
    expect(streakView(at(first - 1))).toMatchObject({ level: 0, next: first });
    expect(streakView(at(first)).level).toBe(1);
    expect(streakActive(at(first - 1))).toBe(false);
    expect(streakActive(at(first))).toBe(true);
    expect(activeLayers(songs.play, 0, true)).toContain('streak');
    expect(activeLayers(songs.play, 4, false)).not.toContain('streak');
  });
});

describe('事件の演出', () => {
  it('事件の発生で incident、解決で島のバグ生物が弾ける incidentResolved を出す', () => {
    const signals = fxSignals(
      [
        { type: 'IncidentStarted', incident: 'retrySpiral', workerId: 'agent', projectId: P, taskId: 'design' },
        { type: 'IncidentResolved', incident: 'retrySpiral', workerId: 'agent' },
      ],
      { projectId: P, bottleneckEntity: null, incidentIslands: { 'retrySpiral:agent': 'island:design' } },
    );
    expect(signals).toEqual([
      { kind: 'incident', entityId: 'island:design' },
      { kind: 'incidentResolved', entityId: 'island:design' },
    ]);
    expect(fxTable.find((d) => d.signal === 'incidentResolved')?.tier).toBe(2);
  });
});
