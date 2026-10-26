import { describe, expect, it } from 'vitest';
import { fxRules, fxTable, fxTiers } from '../../src/content/fx';
import { type FeelPreset, feelPresets } from '../../src/content/look/feel';
import type { GameEvent } from '../../src/core/events';
import { createFxDirector } from '../../src/fx/director';
import { fxSignals, savedHumanHours } from '../../src/view/fx';

const P = 'ecRenewal';

/** 偽の時計を使う director */
function setup(options: { reduced?: boolean; feel?: FeelPreset } = {}) {
  const clock = { now: 0 };
  const director = createFxDirector({
    now: () => clock.now,
    feel: () => options.feel ?? feelPresets.standard,
    reduced: () => options.reduced ?? false,
  });
  /** その時刻に events を流し、起動した演出 ID を返す */
  const at = (ms: number, events: readonly GameEvent[], bottleneckEntity: string | null = null) => {
    clock.now = ms;
    return director.handle(fxSignals(events, { projectId: P, bottleneckEntity })).started.map((c) => c.id);
  };
  return { clock, director, at };
}

const done = (taskId: string, quality = 1): GameEvent => ({ type: 'TaskCompleted', projectId: P, taskId, quality });

describe('fx/director', () => {
  it('events を流したときに起動される演出 ID の列', () => {
    const { at } = setup();
    const log = [
      at(0, [{ type: 'TaskStarted', projectId: P, taskId: 'hearing', mode: 'human' }]),
      at(500, [done('hearing')], 'island:hearing'),
      at(1200, [{ type: 'ReworkDetected', projectId: P, taskId: 'requirements', humanId: 'sato' }]),
      at(1300, [done('requirements', 0.6)]),
      at(3000, [{ type: 'TaskStarted', projectId: P, taskId: 'implementation', mode: 'ai' }]),
      at(9000, [done('release'), { type: 'ProjectCompleted', projectId: P }]),
    ];
    expect(log).toEqual([
      [],
      ['bottleneckCleared', 'taskDone'],
      ['reviewCatch'],
      ['taskDefect'],
      ['automation'],
      ['projectComplete', 'taskDone'],
    ]);
  });

  it('クールダウン中の同じ Tier は抑制し、明けたら再び起動する', () => {
    const { at } = setup();
    const cooldown = fxTiers[1].cooldownMs;
    expect(at(0, [done('hearing')])).toEqual(['taskDone']);
    expect(at(cooldown - 1, [done('research')])).toEqual([]);
    expect(at(cooldown, [done('uiDesign')])).toEqual(['taskDone']);
    // 同じ回に2つ来ても1つだけ
    expect(at(cooldown * 3, [done('qa'), done('release')])).toEqual(['taskDone']);
  });

  it('Task 完了が短い間隔で続くとコンボ数が増え、演出が少しずつ強くなる。間が空いたら 1 に戻る', () => {
    const { clock, director } = setup();
    const gap = fxTiers[1].cooldownMs + 10;
    const combos: number[] = [];
    const intensities: number[] = [];
    for (let i = 0; i < 4; i++) {
      clock.now = i * gap;
      const cue = director.handle([{ kind: 'taskDone', entityId: 'island:hearing' }]).started[0];
      combos.push(cue?.combo ?? -1);
      intensities.push(cue?.intensity ?? -1);
    }
    expect(combos).toEqual([1, 2, 3, 4]);
    for (let i = 1; i < intensities.length; i++) expect(intensities[i]).toBeGreaterThan(intensities[i - 1] ?? 0);
    expect(director.combo()).toBe(4);

    clock.now += fxRules.comboWindowMs + 1;
    expect(director.combo()).toBe(0);
    expect(director.handle([{ kind: 'taskDone', entityId: null }]).started[0]?.combo).toBe(1);
  });

  it('クールダウンで抑制された Task 完了もコンボには数える', () => {
    const { clock, director } = setup();
    director.handle([{ kind: 'taskDone', entityId: null }]);
    clock.now = 10;
    expect(director.handle([{ kind: 'taskDone', entityId: null }]).started).toEqual([]);
    expect(director.combo()).toBe(2);
  });

  it('コンボの強さはプリセットの段数で頭打ちになる', () => {
    const feel = { ...feelPresets.standard, combo: { step: 0.5, maxSteps: 2 } };
    const { clock, director } = setup({ feel });
    let last = 0;
    for (let i = 0; i < 6; i++) {
      clock.now = i * (fxTiers[1].cooldownMs + 1);
      last = director.handle([{ kind: 'taskDone', entityId: null }]).started[0]?.intensity ?? 0;
    }
    expect(last).toBeCloseTo(feel.tiers[1].scale * (1 + 0.5 * 2));
  });

  it('reduced-motion のときは代替の部品で起動する', () => {
    const { director } = setup({ reduced: true });
    const cue = director.handle([{ kind: 'projectComplete', entityId: null }]).started[0];
    expect(cue?.reduced).toBe(true);
    expect(cue?.parts).toEqual(fxTable.find((d) => d.id === 'projectComplete')?.reducedAlternative);
  });

  it('演出の長さが過ぎたら再生中から外れる（同時再生の上限が空く）', () => {
    const { clock, director } = setup();
    director.handle([{ kind: 'automation', entityId: null, amount: 3 }]);
    expect(director.active()).toHaveLength(1);
    clock.now = feelPresets.standard.tiers[3].durationMs;
    expect(director.active()).toHaveLength(0);
    expect(director.handle([{ kind: 'bottleneckCleared', entityId: null }]).started).toHaveLength(1);
  });
});

describe('view/fx（events → 演出のきっかけ）', () => {
  it('自動化の演出は、人間時間の見込みが閾値以上減る担当で作業が始まったときだけ', () => {
    expect(savedHumanHours(P, 'implementation', 'ai')).toBeGreaterThanOrEqual(fxRules.automationMinSavedHours);
    expect(savedHumanHours(P, 'hearing', 'ai')).toBeLessThan(fxRules.automationMinSavedHours);
    const start = (taskId: string): GameEvent => ({ type: 'TaskStarted', projectId: P, taskId, mode: 'ai' });
    const ctx = { projectId: P, bottleneckEntity: null };
    expect(fxSignals([start('hearing')], ctx)).toEqual([]);
    const [signal] = fxSignals([start('implementation')], ctx);
    expect(signal?.kind).toBe('automation');
    expect(signal?.amount).toBeCloseTo(savedHumanHours(P, 'implementation', 'ai'));
  });

  it('ほかの案件の events は無視する', () => {
    expect(
      fxSignals([{ type: 'ProjectCompleted', projectId: 'other' }], { projectId: P, bottleneckEntity: null }),
    ).toEqual([]);
  });
});
