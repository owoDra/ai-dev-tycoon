import { describe, expect, it } from 'vitest';
import { battleSeed } from '../../src/core/battle';
import { readBring } from '../../src/core/bring';
import { reduce } from '../../src/core/commands';
import { encodeResultCode, type ResultRecord } from '../../src/core/resultCode';
import { createInitialState } from '../../src/core/state';
import { ja } from '../../src/i18n/ja';
import { battleBoard, bringCardView } from '../../src/view/bring';
import { harnessView } from '../../src/view/harness';
import { readFixture } from '../helpers/bring';

const cards = readBring(readFixture()).cards;
const P = 'corporateSite';
const AGENT = 'agent';

describe('持ち込みの表示（view/bring.ts）', () => {
  it('カードに、良かった点・伸ばすと強くなる点と「なぜこの性能？」の内訳を出す', () => {
    const notes = cards.find((c) => c.name === 'notes');
    if (!notes) throw new Error('notes がない');
    const v = bringCardView(notes);
    expect(v.category).toBe('Skill');
    expect(v.score).toBe(20);
    expect(v.good).toEqual([ja.bring.criteria.notTooLong.good]);
    expect(v.grow).toContain(ja.bring.criteria.whenToUse.grow);
    expect(v.why[0]).toBe(ja.bring.whyLines.template(ja.harness.parts.skillFrontend));
    expect(v.why[1]).toBe(ja.bring.whyLines.strength(20, 100, 20));
    expect(v.modifiers.map((m) => m.label)).toEqual(['成功率', '人間の介入', '型にはめる度合い']);
  });

  it('Harness Builder に持ち込みカードが同梱の部品と並び、持ち込みの印が付く', () => {
    const started = reduce(createInitialState('bring-view'), { type: 'StartProject', projectId: P }).state;
    const s = reduce(started, { type: 'SetBroughtParts', parts: cards.map((c) => c.id) }).state;
    const view = harnessView(s, P, AGENT);
    const skill = view.rows.find((r) => r.id === 'skill')?.groups[0]?.options ?? [];
    const brought = skill.filter((o) => o.part?.brought);
    expect(brought.map((o) => o.label)).toEqual(['code-review', 'notes']);
    expect(skill.some((o) => o.id === 'skillFrontend')).toBe(true);
    // Hook はタイミングの盾に、持ち込みの名前の見出しで出る
    const pre = view.rows.find((r) => r.id === 'hook:PreToolUse')?.groups ?? [];
    expect(pre.some((g) => g.title?.startsWith('PreToolUse(Bash)'))).toBe(true);
    // 持ち込みの Rules は、Rules に置くか渡さないかを選べるカードになる
    const sort = view.rows.find((r) => r.id === 'receive')?.sort;
    const rule = sort?.cards.find((c) => c.name === 'testing' && c.key.startsWith('x~'));
    expect(rule?.place).toBe('none');
    expect(rule?.moves.map((m) => m.place)).toEqual(['rules']);
    // 持ち込みの CLAUDE.md も仕分けのカードになる
    expect(sort?.cards.some((c) => c.name === 'CLAUDE.md')).toBe(true);
  });

  it('持ち寄りバトルの比較表：同じ合言葉のコードを利益の大きい順に並べ、違う合言葉と読めないコードは後ろに', () => {
    const base: ResultRecord = {
      seed: battleSeed('PARTY'),
      projectId: 'p~BATTLE-PARTY~M',
      profit: 100,
      profitPerPersonDay: 10,
      humanMinutes: 60,
      aiCost: 5,
      quality: 0.9,
      elapsedMinutes: 600,
      rank: 'B',
    };
    const a = encodeResultCode({ ...base, profit: 300, brought: [{ category: 'skill', score: 80 }] });
    const b = encodeResultCode(base);
    const c = encodeResultCode({ ...base, profit: 300 });
    const other = encodeResultCode({ ...base, seed: battleSeed('OTHER'), profit: 999 });
    const rows = battleBoard([b, a, '', 'XXXX', other, c].join('\n'), 'party');
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3, null, null]);
    expect(rows[0]?.cards).toBe(ja.bring.battle.summary('Skill', 80));
    expect(rows[1]?.cards).toBe(ja.bring.battle.noCards);
    expect(rows[3]?.note).toBe(ja.bring.battle.bad);
    expect(rows[4]?.note).toBe(ja.bring.battle.otherSeed);
  });
});
