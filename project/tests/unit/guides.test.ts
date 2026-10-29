import { describe, expect, it } from 'vitest';
import { guideChapters } from '../../src/content/guides';
import { openInquiries, postInquiries } from '../../src/core/board';
import { reduce } from '../../src/core/commands';
import { advanceGuides, currentGuideStep } from '../../src/core/guides';
import { createInitialState, type GameState } from '../../src/core/state';
import { applyUnlocks } from '../../src/core/unlocks';

/** チュートリアルの案件を納品した会社 */
const afterTutorial = (): GameState => {
  const s = createInitialState('guides', { board: true, tutorial: false });
  return postInquiries({ ...s, ledger: { ...s.ledger, delivered: 1 } }, () => {});
};

describe('チュートリアルの後の案内（core/guides.ts）', () => {
  it('最初の納品の後に第2章を始め、「わかった」で読むだけのステップを進め、受注すると次のステップへ進む', () => {
    let s = advanceGuides(afterTutorial());
    expect(s.guide).toEqual({ chapter: 'firstOrder', step: 0 });
    expect(currentGuideStep(s)?.done).toBe('ack');
    s = reduce(s, { type: 'AckGuide' }).state;
    expect(currentGuideStep(s)?.say).toBe('openBoard');
    // 条件で進むステップは「わかった」では進まない
    expect(reduce(s, { type: 'AckGuide' }).state).toBe(s);
    s = reduce(s, { type: 'AcceptOrder', projectId: openInquiries(s)[0] ?? '' }).state;
    expect(currentGuideStep(s)?.say).toBe('work');
  });

  it('章は1つずつ進み、飛ばすと次の章（条件を満たしていれば）へ、すべて飛ばすと以後は出さない', () => {
    const base = afterTutorial();
    // 2件納品済み・スタートアップに昇格した会社：第2章 → 第3章 → スタートアップの章の順
    let s = advanceGuides({ ...base, tier: 'startup', ledger: { ...base.ledger, delivered: 2 } });
    expect(s.guide?.chapter).toBe('firstOrder');
    s = reduce(s, { type: 'SkipGuide' }).state;
    expect(s.guide?.chapter).toBe('money');
    s = reduce(s, { type: 'AckGuide' }).state;
    s = reduce(s, { type: 'AckGuide' }).state;
    expect(s.guidesDone).toEqual(['firstOrder', 'money']);
    expect(s.guide?.chapter).toBe('startup');
    s = reduce(s, { type: 'SkipGuide', all: true }).state;
    expect(s.guide).toBeNull();
    expect([...s.guidesDone].sort()).toEqual(guideChapters.map((c) => c.id).sort());
    expect(advanceGuides({ ...s, tier: 'large' })).toEqual({ ...s, tier: 'large' });
  });

  it('チュートリアル中は出さず、案内は機能の解放を変えない', () => {
    const tutorial = createInitialState('guides-t', { board: true, tutorial: true });
    expect(advanceGuides({ ...tutorial, ledger: { ...tutorial.ledger, delivered: 1 } }).guide).toBeNull();
    const s = afterTutorial();
    const skipped = reduce(advanceGuides(s), { type: 'SkipGuide', all: true }).state;
    expect(applyUnlocks(skipped, () => {}).unlocked).toEqual(applyUnlocks(s, () => {}).unlocked);
  });
});
