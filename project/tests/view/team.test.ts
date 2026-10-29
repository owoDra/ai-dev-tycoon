import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getSeat } from '../../src/content/seats';
import { reduce } from '../../src/core/commands';
import { createInitialState } from '../../src/core/state';
import { usageLimit } from '../../src/core/team';
import { seatPreview, teamView, usageWarning } from '../../src/view/team';

describe('社員と Seat の表示（view/team.ts）', () => {
  it('Seat を1枚増やすプレビューは、1枚の使用量と月額の差。減らすと符号が逆になる', () => {
    const p = seatPreview('premium', 1);
    expect(p.capacity).toBe(getSeat('premium').dailyUsage);
    expect(p.monthlyCost).toBeCloseTo(getSeat('premium').monthlyUsd * balance.seat.yenPerUsd);
    expect(seatPreview('standard', -1).capacity).toBe(-getSeat('standard').dailyUsage);
  });

  it('会社の Seat を種類ごとに並べ、枚数・会社の今日の使用量と上限・固定費の合計を出す', () => {
    const v = teamView(createInitialState('s'));
    expect(v.members.map((m) => m.id)).toEqual(['sato', 'suzuki']);
    const [standard, premium] = v.seats;
    expect(standard).toMatchObject({
      id: 'standard',
      count: 2,
      add: { type: 'SetSeats', seat: 'standard', count: 3 },
      remove: { type: 'SetSeats', seat: 'standard', count: 1 },
    });
    // 0枚の種類は減らせない
    expect(premium).toMatchObject({ id: 'premium', count: 0, remove: null, add: { count: 1 } });
    expect(v.usage).toEqual({ used: 0, limit: 2 * getSeat('standard').dailyUsage, over: false });
    expect(v.monthlyTotal).toBeCloseTo(2 * getSeat('standard').monthlyUsd * balance.seat.yenPerUsd);
    expect(v.model?.usagePerMinute).toBeGreaterThan(0);
  });

  it('解放前は Command を付けず、使い切ったら警告し、買い足すと警告が消える', () => {
    const c = createInitialState('c', { board: true });
    expect(teamView(c).editable).toBe(false);
    expect(teamView(c).seats.every((s) => s.add === null && s.remove === null)).toBe(true);
    const over = { ...c, usage: usageLimit(c) };
    expect(usageWarning(over)).toBe(true);
    expect(teamView(over).usage.over).toBe(true);
    const more = reduce(
      { ...createInitialState('s'), usage: over.usage },
      { type: 'SetSeats', seat: 'premium', count: 1 },
    );
    expect(usageWarning(more.state)).toBe(false);
  });
});
