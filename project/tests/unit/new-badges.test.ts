import { describe, expect, it } from 'vitest';
import { hasNewBadge, menuFeatures } from '../../src/content/unlocks';
import { reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { deserialize, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState } from '../../src/core/state';
import { applyUnlocks, freshMenus, isFresh } from '../../src/core/unlocks';

const P = 'ecRenewal';

/** 最初の納品と規模の昇格で、社員と Seat の画面と Harness Builder を解放したところ（どちらもまだ開いていない） */
function promoted(): GameState {
  const events: GameEvent[] = [];
  const base = createInitialState('new', { tutorial: true, tier: 'startup' });
  const s = applyUnlocks({ ...base, ledger: { ...base.ledger, delivered: 1 } }, (e) => events.push(e));
  expect(events.some((e) => e.type === 'FeatureUnlocked' && e.feature === 'harness')).toBe(true);
  return s;
}

describe('解放した機能の「NEW」の印（state.fresh）', () => {
  it('解放した機能のうち、担当カードかメニューに出す場所のあるものに NEW が付く', () => {
    const s = promoted();
    expect(isFresh(s, 'harness')).toBe(true);
    expect(isFresh(s, 'harness:hook')).toBe(true);
    expect(isFresh(s, 'team')).toBe(true);
    expect([...freshMenus(s)].sort()).toEqual(['harness', 'team']);
    // ドックの項目など、印を出す場所のない機能は持たない
    expect(hasNewBadge('dock:skip')).toBe(false);
    expect(s.fresh.every(hasNewBadge)).toBe(true);
    // 始めから解放済みの機能（チュートリアルの「人間」「AI」・チュートリアルなしの会社）には付かない
    expect(createInitialState('t', { tutorial: true }).fresh).toEqual([]);
    expect(createInitialState('q').fresh).toEqual([]);
  });

  it('メニューの入口を開く（SeeFeatures）と、その入口の NEW だけが消える', () => {
    const s = reduce(promoted(), { type: 'SeeFeatures', features: menuFeatures.harness });
    expect(freshMenus(s.state).has('harness')).toBe(false);
    expect(freshMenus(s.state).has('team')).toBe(true);
    expect(s.events).toEqual([]);
    // チュートリアル中でも開ける
    expect(reduce(s.state, { type: 'SeeFeatures', features: menuFeatures.team }).state.fresh).toEqual([]);
  });

  it('担当カードの NEW は、その任せ方で担当を決めると消える', () => {
    let s: GameState = { ...createInitialState('assign'), fresh: ['mode:aiThenHumanReview', 'mode:aiThenEval'] };
    s = reduce(s, { type: 'StartProject', projectId: P }).state;
    s = reduce(s, {
      type: 'AssignTask',
      projectId: P,
      taskId: 'hearing',
      mode: 'aiThenHumanReview',
      workerId: 'agent',
    }).state;
    expect(s.fresh).toEqual(['mode:aiThenEval']);
  });

  it('NEW の印はセーブを通っても残り、v17 のセーブは印なしで読み込む', () => {
    const s = promoted();
    expect(deserialize(serialize(s)).fresh).toEqual(s.fresh);
    const { fresh: _f, ...v17 } = s;
    expect(deserialize(JSON.stringify({ saveVersion: 17, state: v17 })).fresh).toEqual([]);
  });
});
