import { describe, expect, it } from 'vitest';
import { createSequencer, stepSeconds } from '../../src/audio/music/sequencer';
import { musicRules, songs } from '../../src/content/music';

/** 偽の時計で動かすシーケンサー。予約されたステップを記録する */
function setup(lookahead = musicRules.lookahead) {
  const clock = { now: 0 };
  const scheduled: { step: number; time: number; at: number }[] = [];
  const seq = createSequencer({
    now: () => clock.now,
    lookahead,
    schedule: (step, time) => scheduled.push({ step, time, at: clock.now }),
  });
  return { clock, seq, scheduled };
}

describe('audio/music/sequencer', () => {
  it('ステップの時刻はテンポと一致する（112 BPM・16分音符）', () => {
    const { clock, seq, scheduled } = setup();
    const song = songs.play;
    seq.start(1, song.tempo, song.stepsPerBeat);
    for (let t = 0; t <= 4; t += 0.025) {
      clock.now = t;
      seq.tick();
    }
    const dur = 60 / 112 / 4;
    expect(stepSeconds(song.tempo, song.stepsPerBeat)).toBeCloseTo(dur, 12);
    expect(scheduled.length).toBeGreaterThan(20);
    scheduled.forEach((s, i) => {
      expect(s.step).toBe(i);
      expect(s.time).toBeCloseTo(1 + i * dur, 9);
    });
  });

  it('lookahead より先は予約せず、過ぎた時刻のステップも予約しない', () => {
    const { clock, seq, scheduled } = setup(0.1);
    seq.start(0, 120, 4);
    for (let t = 0; t <= 3; t += 0.03) {
      clock.now = t;
      seq.tick();
    }
    for (const s of scheduled) {
      expect(s.time).toBeLessThan(s.at + 0.1);
      expect(s.time).toBeGreaterThanOrEqual(s.at - stepSeconds(120, 4));
    }
  });

  it('tick の間隔が揺れても、10分間でずれが積み重ならない（ドリフトしない）', () => {
    const { clock, seq, scheduled } = setup();
    seq.start(0, 112, 4);
    const dur = stepSeconds(112, 4);
    // 間隔が 5〜60ms で不規則に揺れるタイマー
    let seed = 7;
    while (clock.now < 600) {
      seed = (seed * 48271) % 2147483647;
      clock.now += 0.005 + (seed / 2147483647) * 0.055;
      seq.tick();
    }
    const last = scheduled.at(-1);
    if (!last) throw new Error('何も予約されていない');
    expect(last.step).toBeGreaterThan(4000);
    // 浮動小数の誤差（1μs 未満）以外のずれがない
    expect(Math.abs(last.time - last.step * dur)).toBeLessThan(1e-6);
    // ステップの抜けも重複もない
    scheduled.forEach((s, i) => {
      expect(s.step).toBe(i);
    });
  });

  it('テンポを変えると、まだ予約していないステップから新しい間隔になり、途中で時刻が戻らない', () => {
    const { clock, seq, scheduled } = setup();
    seq.start(0, 120, 4);
    clock.now = 1;
    seq.tick();
    const before = scheduled.length;
    seq.setTempo(60);
    for (; clock.now < 3; clock.now += 0.025) seq.tick();
    const after = scheduled.slice(before);
    const prev = scheduled[before - 1];
    if (!prev || after.length < 2) throw new Error('予約が足りない');
    expect(after[0]?.time).toBeCloseTo(prev.time + stepSeconds(120, 4), 9);
    for (let i = 1; i < after.length; i++) {
      expect((after[i]?.time ?? 0) - (after[i - 1]?.time ?? 0)).toBeCloseTo(stepSeconds(60, 4), 9);
    }
  });

  it('大きく遅れた（タブが裏に回った）ら、過ぎたステップはまとめて鳴らさず格子の上で飛ばす', () => {
    const { clock, seq, scheduled } = setup();
    seq.start(0, 120, 4);
    clock.now = 0.05;
    seq.tick();
    const before = scheduled.length;
    clock.now = 10;
    seq.tick();
    const late = scheduled.slice(before);
    expect(late.length).toBeLessThanOrEqual(2);
    const dur = stepSeconds(120, 4);
    for (const s of late) {
      expect(s.time).toBeGreaterThanOrEqual(10 - dur);
      expect(s.time / dur).toBeCloseTo(s.step, 6);
    }
  });

  it('止めたら予約しない', () => {
    const { clock, seq, scheduled } = setup();
    seq.start(0, 120, 4);
    seq.stop();
    clock.now = 1;
    expect(seq.tick()).toBe(0);
    expect(scheduled).toEqual([]);
    expect(seq.next()).toBeNull();
  });
});
