import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getSeat } from '../../src/content/seats';
import { reduce } from '../../src/core/commands';
import { createInitialState } from '../../src/core/state';
import { seatPreview, teamView, usageWarning } from '../../src/view/team';

describe('社員と Seat の表示（view/team.ts）', () => {
  it('Standard → Premium のプレビューは AI 容量 +400% と、月額の差', () => {
    const p = seatPreview('standard', 'premium');
    expect(p.capacity).toBeCloseTo(4);
    const diff = (getSeat('premium').monthlyUsd - getSeat('standard').monthlyUsd) * balance.seat.yenPerUsd;
    expect(p.monthlyCost).toBeCloseTo(diff);
    expect(seatPreview('premium', 'standard').capacity).toBeCloseTo(-0.8);
  });

  it('会社にいる社員を並べ、運用者にだけ使用量を出し、選んでいない Seat にだけプレビューと Command を付ける', () => {
    const v = teamView(createInitialState('s'));
    expect(v.members.map((m) => m.id)).toEqual(['sato', 'suzuki']);
    const suzuki = v.members.find((m) => m.id === 'suzuki');
    expect(suzuki?.operator).toBe(true);
    expect(suzuki?.usage).toEqual({ used: 0, limit: getSeat('standard').dailyUsage, over: false });
    expect(v.members.find((m) => m.id === 'sato')?.usage).toBeNull();
    const [standard, premium] = suzuki?.options ?? [];
    expect(standard).toMatchObject({ id: 'standard', selected: true, preview: null, command: null });
    expect(premium).toMatchObject({ id: 'premium', selected: false, command: { type: 'SetSeat', staffId: 'suzuki' } });
    expect(v.monthlyTotal).toBeCloseTo(2 * getSeat('standard').monthlyUsd * balance.seat.yenPerUsd);
    expect(v.model?.usagePerMinute).toBeGreaterThan(0);
  });

  it('解放前は Command を付けず、上限超えなら警告する', () => {
    const c = createInitialState('c', { campaign: true });
    expect(teamView(c).editable).toBe(false);
    expect(
      teamView(c)
        .members.flatMap((m) => m.options)
        .every((o) => o.command === null),
    ).toBe(true);
    // Standard の上限は超えているが Premium の上限には届かない使用量
    const used = getSeat('standard').dailyUsage + 1;
    expect(used).toBeLessThan(getSeat('premium').dailyUsage);
    const over = { ...c, team: { ...c.team, suzuki: { seat: 'standard' as const, used } } };
    expect(usageWarning(over)).toBe(true);
    const premium = reduce(
      { ...createInitialState('s'), team: over.team },
      { type: 'SetSeat', staffId: 'suzuki', seat: 'premium' },
    ).state;
    expect(usageWarning(premium)).toBe(false);
  });
});
