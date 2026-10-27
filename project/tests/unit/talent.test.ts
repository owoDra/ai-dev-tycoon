import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { findWorker, getHuman, getTask } from '../../src/content/index';
import { talentRoles } from '../../src/content/talent';
import { successProbability } from '../../src/core/formulas';
import { createInitialState } from '../../src/core/state';
import {
  generateTalent,
  initialTalent,
  isTalentId,
  marketCandidates,
  talentId,
  talentRate,
} from '../../src/core/talent';

const ids = (n: number) => Array.from({ length: n }, (_, i) => talentId(`unit-${i}`));

describe('人材の生成（core/talent.ts）', () => {
  it('同じ seed なら同じ人材になり、seed が違えば違う人材になる', () => {
    const a = generateTalent(talentId('same'));
    expect(a).toEqual(generateTalent(talentId('same')));
    const others = ids(20).map((id) => generateTalent(id));
    expect(new Set(others.map((h) => `${h?.name}/${h?.skill}/${h?.accuracy}/${h?.dailyRate}`)).size).toBeGreaterThan(
      15,
    );
  });

  it('id から再生成すると一致し、getHuman は生成した id も解決する（state には id だけを持つ）', () => {
    for (const id of ids(30)) {
      const h = getHuman(id);
      expect(h.id).toBe(id);
      expect(isTalentId(id)).toBe(true);
      // キャッシュを通さずに作り直した値と同じ（JSON を経由しても同じ定義に戻る）
      const fresh = generateTalent(JSON.parse(JSON.stringify(id)) as string);
      expect(fresh).toEqual(h);
      expect(findWorker(id)).toEqual(h);
    }
    expect(generateTalent('sato')).toBeUndefined();
    expect(() => getHuman('h~')).not.toThrow();
  });

  it('能力は balance の範囲に収まり、得意分野は 0〜2個で職種の候補から選ばれる', () => {
    for (const id of ids(200)) {
      const h = getHuman(id);
      const { skill, accuracy } = balance.talent;
      expect(h.skill).toBeGreaterThanOrEqual(skill.min);
      expect(h.skill).toBeLessThanOrEqual(skill.max);
      expect(h.accuracy).toBeGreaterThanOrEqual(accuracy.min);
      expect(h.accuracy).toBeLessThanOrEqual(accuracy.max);
      expect(h.strengths.length).toBeLessThanOrEqual(2);
      expect(new Set(h.strengths).size).toBe(h.strengths.length);
      const pool = talentRoles.find((r) => r.role === h.role)?.strengths ?? [];
      for (const k of h.strengths) expect(pool).toContain(k);
      expect(h.name).toMatch(/^\S+ \S+$/);
      expect(h.seat).toBe('standard');
    }
  });

  it('売値は下限以上で、能力が高いほど高い', () => {
    for (const id of ids(200)) expect(getHuman(id).dailyRate).toBeGreaterThanOrEqual(balance.talent.rate.floor);
    expect(talentRate(0.5, 0.8, 0)).toBe(balance.talent.rate.floor);
    expect(talentRate(1.2, 0.97, 1)).toBeGreaterThan(talentRate(1, 0.97, 1));
    expect(talentRate(1, 1, 1)).toBeGreaterThan(talentRate(1, 0.95, 1));
    expect(talentRate(1, 0.97, 2)).toBeGreaterThan(talentRate(1, 0.97, 0));
  });

  it('正確さが人間の成功確率に効く（速度が同じなら、正確な人ほど失敗しにくい）', () => {
    const task = getTask('ecRenewal', 'implementation');
    const careful = successProbability(task, { kind: 'human', skill: 1, accuracy: 0.99 });
    const careless = successProbability(task, { kind: 'human', skill: 1, accuracy: 0.92 });
    expect(careful).toBeGreaterThan(careless);
    // 省けば平均的な人（balance.human.competence）
    expect(successProbability(task, { kind: 'human', skill: 1 })).toBeCloseTo(
      successProbability(task, { kind: 'human', skill: 1, accuracy: balance.human.competence }),
    );
  });

  it('チュートリアルなしで始めると、最初の社員は seed から生成した平均的な2人（得意分野なし）', () => {
    const s = createInitialState('quick', { campaign: true, talent: true });
    const team = Object.keys(s.team);
    expect(team).toEqual(initialTalent('quick'));
    expect(team).toHaveLength(balance.hire.initialStaff);
    for (const id of team) {
      const h = getHuman(id);
      expect(h.skill).toBeCloseTo((balance.talent.skill.min + balance.talent.skill.max) / 2);
      expect(h.accuracy).toBeCloseTo(balance.human.competence);
      expect(h.strengths).toEqual([]);
    }
    expect(initialTalent('another')).not.toEqual(team);
    // チュートリアルは固定の2人のまま
    expect(Object.keys(createInitialState('quick', { campaign: true }).team)).toEqual(['sato', 'suzuki']);
  });

  it('創業メンバーの佐藤と鈴木は、市場の平均より速くて正確で、売値も高い', () => {
    for (const id of ['sato', 'suzuki']) {
      const h = getHuman(id);
      expect(h.skill).toBeGreaterThan(1);
      expect(h.accuracy).toBeGreaterThan(balance.human.competence);
      expect(h.dailyRate).toBeGreaterThan(balance.talent.rate.mean);
    }
  });

  it('採用市場の候補は、ゲームの seed と営業日から決まる', () => {
    expect(marketCandidates('g', 3)).toEqual(marketCandidates('g', 3));
    expect(marketCandidates('g', 3)).toHaveLength(balance.hire.candidates);
    expect(marketCandidates('g', 3)).not.toEqual(marketCandidates('g', 4));
    expect(marketCandidates('g', 3)).not.toEqual(marketCandidates('h', 3));
  });
});
