import { describe, expect, it } from 'vitest';
import { type FxSignalKind, fxRules, fxTable, fxTierList, fxTiers, KINETIC_PARTS } from '../../src/content/fx';
import { feelPresets } from '../../src/content/look/feel';
import { createFxDirector } from '../../src/fx/director';
import { ja } from '../../src/i18n/ja';
import { MAX_SHAKE_PX } from '../../src/world/vfx/shake';

const SIGNALS: readonly FxSignalKind[] = [
  'select',
  'taskDone',
  'taskDefect',
  'reviewCatch',
  'bottleneckCleared',
  'automation',
  'projectComplete',
];

describe('演出の Tier テーブル', () => {
  it('全 Tier にクールダウン（> 0 ms）と同時再生の上限（1 以上）が定義されている', () => {
    for (const tier of fxTierList) {
      expect(fxTiers[tier].cooldownMs, `Tier ${tier}`).toBeGreaterThan(0);
      expect(fxTiers[tier].maxConcurrent, `Tier ${tier}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('Tier 0〜4 のすべてに演出があり、Tier が上がるほどクールダウンが長い', () => {
    expect(new Set(fxTable.map((d) => d.tier))).toEqual(new Set(fxTierList));
    for (let t = 1; t < fxTierList.length; t++) {
      expect(fxTiers[fxTierList[t] ?? 0].cooldownMs).toBeGreaterThanOrEqual(fxTiers[fxTierList[t - 1] ?? 0].cooldownMs);
    }
  });

  it('Tier 3 以上は同時に1つだけ再生される（上限の値と、実際に director で流したとき）', () => {
    expect(fxRules.exclusiveFromTier).toBe(3);
    expect(fxTiers[3].maxConcurrent).toBe(1);
    expect(fxTiers[4].maxConcurrent).toBe(1);

    let now = 0;
    const director = createFxDirector({ now: () => now, feel: () => feelPresets.standard, reduced: () => false });
    const big = (d: { active(): readonly { tier: number }[] }) => d.active().filter((c) => c.tier >= 3).length;

    // 同じ回に Tier 3 が2つ来ても1つだけ
    const first = director.handle([
      { kind: 'automation', entityId: 'island:implementation', amount: 4.5 },
      { kind: 'bottleneckCleared', entityId: 'island:qa' },
    ]);
    expect(first.started.map((c) => c.id)).toEqual(['automation']);
    expect(big(director)).toBe(1);

    // クールダウンが明けても、再生中の Tier 3 があれば次の Tier 3 は抑制する
    now += fxTiers[3].cooldownMs + 1;
    expect(director.handle([{ kind: 'bottleneckCleared', entityId: 'island:qa' }]).started).toEqual([]);
    expect(big(director)).toBe(1);

    // Tier 4 は再生中の Tier 3 と入れ替わる（同時には2つにならない）
    const top = director.handle([{ kind: 'projectComplete', entityId: null }]);
    expect(top.started.map((c) => c.id)).toEqual(['projectComplete']);
    expect(top.cancelled).toEqual([first.started[0]?.token]);
    expect(big(director)).toBe(1);

    // Tier 4 の再生中に来た Tier 3 は抑制する
    now += fxTiers[3].cooldownMs + 1;
    expect(director.handle([{ kind: 'automation', entityId: 'island:qa', amount: 3 }]).started).toEqual([]);
    expect(big(director)).toBe(1);
  });

  it('すべての演出に reduced の代替があり、代替には拡大・揺れ・紙吹雪・フラッシュを含まない', () => {
    for (const def of fxTable) {
      expect(def.reducedAlternative.length, def.id).toBeGreaterThan(0);
      expect(
        def.reducedAlternative.filter((p) => KINETIC_PARTS.has(p)),
        def.id,
      ).toEqual([]);
    }
    for (const p of ['islandBounce', 'cameraShake', 'confetti', 'flash'] as const)
      expect(KINETIC_PARTS.has(p)).toBe(true);
  });

  it('きっかけ1つにつき演出は1つで、ID は重複せず、文字は ja.ts にある', () => {
    for (const kind of SIGNALS)
      expect(
        fxTable.filter((d) => d.signal === kind),
        kind,
      ).toHaveLength(1);
    expect(new Set(fxTable.map((d) => d.id)).size).toBe(fxTable.length);
    for (const def of fxTable) {
      if (def.label) expect(ja.fx.labels[def.label.key], def.id).not.toBe('');
      if (def.parts.includes('actorExpression')) expect(def.expression, def.id).toBeDefined();
    }
  });

  it('手触りのプリセットは全 Tier の値を持ち、揺れは上限以内・Tier が上がるほど長く大きい', () => {
    for (const feel of Object.values(feelPresets)) {
      for (const tier of fxTierList) {
        const look = feel.tiers[tier];
        expect(look.shakePx).toBeLessThanOrEqual(MAX_SHAKE_PX);
        expect(look.flash).toBeGreaterThanOrEqual(0);
        expect(look.flash).toBeLessThanOrEqual(1);
      }
      for (let t = 1; t < fxTierList.length; t++) {
        const a = feel.tiers[fxTierList[t - 1] ?? 0];
        const b = feel.tiers[fxTierList[t] ?? 0];
        expect(b.durationMs).toBeGreaterThanOrEqual(a.durationMs);
        expect(b.scale).toBeGreaterThanOrEqual(a.scale);
      }
      // フラッシュとカメラの揺れは Tier 4 だけ（全部が派手になって価値が下がるのを防ぐ）
      expect(fxTierList.filter((t) => feel.tiers[t].flash > 0)).toEqual([4]);
    }
  });
});
