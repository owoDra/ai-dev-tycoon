import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { allFeatures } from '../../src/content/unlocks';
import { checkAchievements } from '../../src/core/achievements';
import { reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { rollIncidents } from '../../src/core/incidents';
import { createRngCursor, hashSeed } from '../../src/core/rng';
import { createInitialState, type GameState } from '../../src/core/state';
import { consumeUsage, usageLimit } from '../../src/core/team';
import { applyUnlocks, isUnlocked } from '../../src/core/unlocks';

/** チュートリアルを終えた個人事業の会社 */
const company = (): GameState => ({ ...createInitialState('early', { board: true, tutorial: false }), tier: 'solo' });

describe('序盤を軽くする（Phase 38）', () => {
  it('Seat の購入は、AI の使用量が上限に達した日を経験してから解放する（それまで枚数は変えられない）', () => {
    let s: GameState = { ...company(), unlocked: ['mode:human', 'mode:ai', 'team'], unlockDay: null };
    expect(reduce(s, { type: 'SetSeats', seat: 'premium', count: 1 }).state.seats.premium).toBe(0);
    // 上限の手前まで使っても数えず、上限を越えた時に1日として数える（同じ日にさらに使っても増えない）
    s = consumeUsage(s, usageLimit(s) - 1);
    expect(s.cappedDays).toBe(0);
    s = consumeUsage(s, 2);
    s = consumeUsage(s, 5);
    expect(s.cappedDays).toBe(1);
    s = applyUnlocks(s, () => {});
    expect(isUnlocked(s, 'seats')).toBe(true);
    expect(reduce(s, { type: 'SetSeats', seat: 'premium', count: 1 }).state.seats.premium).toBe(1);
  });

  it('個人事業の会社では Harness 由来の事件が起きず、スタートアップから起きうる', () => {
    const base: GameState = { ...company(), unlocked: allFeatures };
    const events: GameEvent[] = [];
    const ctx = { rng: createRngCursor(hashSeed('incidents')), emit: (e: GameEvent) => events.push(e) };
    // どの事件も解放済みでも、個人事業のうちは判定しない
    const solo = rollIncidents(base, 'aiWork', 'agent', 'tutorialLp', 'wireframe', ctx);
    expect(solo).toBe(base);
    expect(events).toEqual([]);
    expect(balance.companyEvents.later.incidents).toBe('startup');
  });

  it('実績は個人事業のうちは判定も表示もせず、スタートアップに上がってから記録する', () => {
    const delivered = { ...company(), ledger: { ...company().ledger, delivered: 1 } };
    const events: GameEvent[] = [];
    expect(checkAchievements(delivered, { kind: 'state' }, (e) => events.push(e))).toBe(delivered);
    expect(events).toEqual([]);
    const promoted = checkAchievements({ ...delivered, tier: 'startup' }, { kind: 'state' }, (e) => events.push(e));
    expect(promoted.achievements.map((a) => a.id)).toContain('firstDelivery');
  });

  it('個人事業は同時に1件、スタートアップから掛け持ちできる', () => {
    expect(balance.company.tiers.solo.maxProjects).toBe(1);
    expect(balance.company.tiers.startup.maxProjects).toBeGreaterThan(1);
  });
});
