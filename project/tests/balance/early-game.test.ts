import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { companyTiers } from '../../src/content/companyTiers';
import type { FeatureId } from '../../src/content/types';
import { basicFeatures } from '../../src/content/unlocks';
import { createInitialState, type GameState } from '../../src/core/state';
import { applyUnlocks } from '../../src/core/unlocks';

const DAY = balance.time.minutesPerDay;
/** 1つの規模で新しく届く機能の上限（シンプルに始めて段階的に複雑にする。Phase 38） */
const MAX_NEW_PER_TIER = 2;

/**
 * 体験の条件を満たさない遊び方でも、規模の昇格と納品の数で必ず届く機能を、規模ごとに数える。
 * 各規模にいる間に、次の規模の昇格の条件の納品数まで納品した会社を、解放が落ち着くまで営業日を進めて調べる
 */
function guaranteedByTier(): { tier: string; features: FeatureId[] }[] {
  let state: GameState = createInitialState('ladder', { board: true, tutorial: true });
  state = { ...state, tutorial: null };
  const rows: { tier: string; features: FeatureId[] }[] = [];
  let day = 0;
  for (const [i, tier] of companyTiers.entries()) {
    const before = new Set(state.unlocked);
    const delivered = (companyTiers[i + 1] ?? tier).requires.delivered;
    state = { ...state, tier: tier.id, ledger: { ...state.ledger, delivered } };
    for (let d = 0; d < 20; d++) state = applyUnlocks({ ...state, clock: ++day * DAY }, () => {});
    const features = state.unlocked.filter((f) => !before.has(f) && !basicFeatures.includes(f));
    rows.push({ tier: tier.name, features });
  }
  return rows;
}

describe('序盤はシンプルに始め、規模が上がるたびに少しずつ複雑になる', () => {
  it(`どの規模でも、新しく届く機能は ${MAX_NEW_PER_TIER} つまで`, () => {
    const rows = guaranteedByTier();
    console.log(
      `[段階] 規模ごとに届く機能\n${rows.map((r) => `  ${r.tier}：${r.features.join('・') || 'なし'}`).join('\n')}`,
    );
    for (const r of rows) expect(r.features.length, r.tier).toBeLessThanOrEqual(MAX_NEW_PER_TIER);
    // 最後には体験の条件によらず、Harness の3つの束まで届く
    expect(rows.flatMap((r) => r.features)).toEqual(
      expect.arrayContaining(['harness', 'harness:eval', 'harness:tool']),
    );
  });
});
