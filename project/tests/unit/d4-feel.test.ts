import { describe, expect, it } from 'vitest';
import { songTempo, swingOffset } from '../../src/audio/music/player';
import { fxRules, fxTable, fxTierList } from '../../src/content/fx';
import { getProject } from '../../src/content/index';
import {
  composeFeel,
  defaultFeelChoice,
  type FeelIntensityId,
  type FeelMotionId,
  feelIntensities,
  feelMotions,
} from '../../src/content/look/feel';
import { defaultSoundPaletteId, type SoundPaletteId, soundPalettes } from '../../src/content/look/sound';
import { songs } from '../../src/content/music';
import { DEMO_PROJECT } from '../../src/dev/explore/d2/demo';
import {
  beatsBetween,
  beatTier,
  DEMO_SECONDS,
  demoTimeline,
  feelComboIds,
  feelCombos,
  matchCombo,
  momentumAt,
} from '../../src/dev/explore/d4/demo';
import { bounceKeyframes } from '../../src/world/vfx/squash';

const intensityIds = Object.keys(feelIntensities) as FeelIntensityId[];
const motionIds = Object.keys(feelMotions) as FeelMotionId[];
const paletteIds = Object.keys(soundPalettes) as SoundPaletteId[];

describe('手触りの2軸（演出の強さ × モーションの性格）', () => {
  it('演出の強さは3段階で、どの Tier でも 控えめ ≤ 標準 ≤ 派手 の順に大きく・長く・多い', () => {
    expect(intensityIds).toEqual(['calm', 'standard', 'flashy']);
    for (const tier of fxTierList) {
      const [calm, standard, flashy] = intensityIds.map((id) => feelIntensities[id].tiers[tier]);
      for (const key of ['scale', 'durationMs', 'particles', 'shakePx', 'flash'] as const) {
        expect(calm?.[key]).toBeLessThanOrEqual(standard?.[key] ?? 0);
        expect(standard?.[key]).toBeLessThanOrEqual(flashy?.[key] ?? 0);
      }
    }
    expect(feelIntensities.calm.tiers[4].scale).toBeLessThan(feelIntensities.flashy.tiers[4].scale);
  });

  it('採用したモーションの性格（ぷるぷる）は、柔らかい spring で何度か揺り返してから止まる', () => {
    expect(motionIds).toEqual(['bouncy']);
    const { bouncy } = feelMotions;
    if (bouncy.transition.type !== 'spring') throw new Error('spring のはず');
    // 減衰比（damping / 2√(k·m)）が小さいほど大きく揺れる
    const t = bouncy.transition;
    expect(t.damping / (2 * Math.sqrt(t.stiffness * t.mass))).toBeLessThan(0.3);
    expect(bouncy.bounce.wobbles).toBeGreaterThan(1);
    expect(bouncy.pop.overshoot).toBeGreaterThan(1);
    expect(bouncy.pop.from).toBeLessThan(1);
  });

  it('2軸は独立：組み合わせると強さの値とモーションの値をそのまま持つ', () => {
    for (const i of intensityIds) {
      for (const m of motionIds) {
        const feel = composeFeel(feelIntensities[i], feelMotions[m]);
        expect(feel.tiers).toBe(feelIntensities[i].tiers);
        expect(feel.motion).toBe(feelMotions[m]);
      }
    }
  });

  it('弾みのキーフレームは 1 から潰れて始まり、揺り返しの回数だけ増えて 1 に戻る', () => {
    expect(bounceKeyframes(0.2, { overshoot: 0, wobbles: 0, seconds: 0.5 })).toEqual([1, 0.8, 1]);
    const keys = bounceKeyframes(0.2, feelMotions.bouncy.bounce);
    expect(keys).toHaveLength(2 + feelMotions.bouncy.bounce.wobbles + 1);
    expect(keys[0]).toBe(1);
    expect(keys.at(-1)).toBe(1);
    expect(keys[2]).toBeGreaterThan(1);
    expect(keys[3]).toBeLessThan(1);
  });
});

describe('音色のパレット（BGM の曲調と音量バランス）', () => {
  it('採用したパレット（ウッド＆マリンバ）は約101 BPM で少しハネ、効果音と BGM のバランスは 0〜1', () => {
    expect(paletteIds).toEqual(['wood']);
    const p = soundPalettes.wood;
    expect(Math.round(songTempo(songs.play, p))).toBe(101);
    expect(p.music.swing).toBeGreaterThan(0);
    expect(p.music.swing).toBeLessThan(0.5);
    for (const v of [p.mix.sfx, p.mix.music]) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('ハネは裏のステップだけを遅らせる', () => {
    expect(swingOffset(0, 0.1, 0.2)).toBe(0);
    expect(swingOffset(1, 0.1, 0.2)).toBeCloseTo(0.02);
    expect(swingOffset(2, 0.1, 0.2)).toBe(0);
    expect(swingOffset(3, 0.1, 0)).toBe(0);
  });
});

describe('D4 のデモ再生', () => {
  it('約60秒で、時刻の順に並び、Tier 0〜4 をすべて通る', () => {
    expect(DEMO_SECONDS).toBeGreaterThanOrEqual(55);
    expect(DEMO_SECONDS).toBeLessThanOrEqual(65);
    const times = demoTimeline.map((b) => b.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times.at(-1)).toBeLessThan(DEMO_SECONDS);
    expect(new Set(demoTimeline.map(beatTier))).toEqual(new Set(fxTierList));
  });

  it('Task 完了 → コンボ → 事件 → 自動修復 → ボトルネック解消 → Autonomy Streak → 案件完了 の順に起きる', () => {
    const order = ['taskDone', 'incident', 'autoRepair', 'bottleneckCleared', 'autonomyStreak', 'projectComplete'];
    const firstAt = order.map((kind) => demoTimeline.find((b) => b.kind === kind)?.at ?? Number.NaN);
    expect(firstAt.every(Number.isFinite)).toBe(true);
    expect(firstAt).toEqual([...firstAt].sort((a, b) => a - b));
    // コンボ：コンボの窓より短い間隔で Task 完了が3回以上続く区間がある
    const done = demoTimeline.filter((b) => b.kind === 'taskDone').map((b) => b.at);
    let run = 1;
    let best = 1;
    for (let i = 1; i < done.length; i++) {
      run = (done[i] ?? 0) - (done[i - 1] ?? 0) <= fxRules.comboWindowMs / 1000 ? run + 1 : 1;
      best = Math.max(best, run);
    }
    expect(best).toBeGreaterThanOrEqual(3);
  });

  it('どの拍も演出の表にある（または音だけの拍）、島は案件の工程の範囲にある', () => {
    const islands = getProject(DEMO_PROJECT).tasks.length;
    for (const beat of demoTimeline) {
      if (beat.kind !== 'taskStart')
        expect(
          fxTable.some((d) => d.signal === beat.kind),
          beat.kind,
        ).toBe(true);
      expect(beat.island).toBeLessThan(islands);
    }
  });

  it('時刻の区間で拍を取り出し、BGM の勢いはそれまでの最後の指定になる', () => {
    expect(beatsBetween(demoTimeline, 0, 1.5).map((b) => b.kind)).toEqual(['select']);
    expect(beatsBetween(demoTimeline, 1.5, 1.5)).toEqual([]);
    expect(momentumAt(demoTimeline, 0)).toBe(0);
    expect(momentumAt(demoTimeline, DEMO_SECONDS)).toBe(1);
  });
});

describe('採用した組み合わせ', () => {
  it('採用した A（標準 × ぷるぷる × ウッド＆マリンバ）が既定値になっている', () => {
    expect(feelComboIds).toEqual(['A']);
    expect(defaultFeelChoice).toEqual({ intensity: feelCombos.A.intensity, motion: feelCombos.A.motion });
    expect(defaultSoundPaletteId).toBe(feelCombos.A.palette);
  });

  it('いまの選択が採用した組み合わせと一致すればその ID、違えば null', () => {
    expect(matchCombo(feelCombos.A)).toBe('A');
    expect(matchCombo({ ...feelCombos.A, intensity: 'calm' })).toBeNull();
  });
});
