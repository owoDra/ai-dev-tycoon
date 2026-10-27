import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { companyTiers, getCompanyTier } from '../../src/content/companyTiers';
import { inquiriesOn } from '../../src/core/board';
import { type Command, reduce } from '../../src/core/commands';
import { nextTier, promote, promotionProgress, tierOf } from '../../src/core/company';
import type { GameEvent } from '../../src/core/events';
import { generatedProjectId } from '../../src/core/projectGen';
import { scoreCompany } from '../../src/core/scoring';
import { deserialize, serialize } from '../../src/core/serialize';
import { createInitialState, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { marketCandidates } from '../../src/core/talent';
import { teamFull } from '../../src/core/team';
import { agentBlock, teamBlock } from '../../src/core/teams';
import { growCompany } from '../helpers/growth';

const DAY = balance.project.minutesPerBusinessDay;
/** 会社を育てる営業日（中堅まで昇格する長さ） */
const GROW_DAYS = 150;

/** 案件ボードのある会社（チュートリアルなし） */
const company = (seed = 'tier', tier: GameState['tier'] = 'solo') =>
  createInitialState(seed, { board: true, tutorial: false, tier });

/** 次の段階の条件をちょうど満たす会社（利益は待機中の給与をマイナスにして作る） */
function ready(state: GameState): GameState {
  const need = nextTier(state)?.requires;
  if (!need) return state;
  const profit = scoreCompany(state).profit;
  const delivered = Object.fromEntries(
    Array.from({ length: need.delivered }, (_, i) => {
      const id = generatedProjectId(`done${i}`, 'S');
      return [id, { ...emptyProject(id), completedAt: 0 }];
    }),
  );
  return {
    ...state,
    reputation: need.reputation,
    idleCost: state.idleCost - (need.profit - profit),
    projects: { ...state.projects, ...delivered },
  };
}

function emptyProject(projectId: string) {
  return {
    projectId,
    startedAt: 0,
    completedAt: null,
    revenue: 0,
    deadlineDays: 1,
    tasks: {},
    management: { minutes: 0, laborCost: 0, aiCost: 0, playerAssigned: 0 },
  };
}

describe('会社の規模の定義（content/companyTiers.ts）', () => {
  it('個人事業 → スタートアップ → 小規模 → 中堅 → 大手 の順で、上がるほど条件が厳しく、上限・引き合い・固定費が増える', () => {
    expect(companyTiers.map((t) => t.id)).toEqual(['solo', 'startup', 'small', 'mid', 'large']);
    for (let i = 1; i < companyTiers.length; i++) {
      const [a, b] = [companyTiers[i - 1], companyTiers[i]];
      if (!a || !b) throw new Error('段階がない');
      expect(b.requires.profit).toBeGreaterThan(a.requires.profit);
      expect(b.requires.delivered).toBeGreaterThan(a.requires.delivered);
      expect(b.requires.reputation).toBeGreaterThanOrEqual(a.requires.reputation);
      expect(b.maxStaff).toBeGreaterThan(a.maxStaff);
      expect(b.maxAiWorkers).toBeGreaterThanOrEqual(a.maxAiWorkers);
      expect(b.maxTeams).toBeGreaterThanOrEqual(a.maxTeams);
      expect(b.inquiries).toBeGreaterThanOrEqual(a.inquiries);
      expect(b.officeDaily).toBeGreaterThan(a.officeDaily);
    }
    // 序盤は管理者を雇えず、チームは直轄の1つだけ。管理者は「小規模」から
    expect(companyTiers.filter((t) => !t.managers).map((t) => t.id)).toEqual(['solo', 'startup']);
    expect(getCompanyTier('solo').maxTeams).toBe(1);
    expect(getCompanyTier('small').maxTeams).toBeGreaterThan(1);
    // 大きい規模の案件は、会社が育ってから
    expect(getCompanyTier('solo').sizes.L + getCompanyTier('solo').sizes.XL).toBe(0);
    expect(getCompanyTier('small').sizes.L).toBeGreaterThan(0);
    expect(getCompanyTier('mid').sizes.XL).toBeGreaterThan(0);
  });
});

describe('昇格の条件（core/company.ts）', () => {
  it('累計の利益・評判・納品数をすべて満たすと昇格し、CompanyPromoted を出す', () => {
    const s = ready(company());
    expect(promotionProgress(s)?.ready).toBe(true);
    const events: GameEvent[] = [];
    const promoted = promote(s, (e) => events.push(e));
    expect(promoted.tier).toBe('startup');
    expect(events).toEqual([{ type: 'CompanyPromoted', from: 'solo', tier: 'startup' }]);
  });

  it('どれか1つでも足りなければ昇格しない', () => {
    const s = ready(company());
    const need = nextTier(s)?.requires;
    if (!need) throw new Error('次の段階がない');
    const lacking: GameState[] = [
      { ...s, reputation: need.reputation - 1 },
      { ...s, idleCost: s.idleCost + 1 },
      { ...s, projects: Object.fromEntries(Object.entries(s.projects).slice(1)) },
    ];
    for (const l of lacking) {
      expect(promotionProgress(l)?.ready).toBe(false);
      expect(promote(l, () => {}).tier).toBe('solo');
    }
  });

  it('単発のプレイ（案件ボードのない state）は昇格しない。最上位の次はない', () => {
    const single = ready(createInitialState('single'));
    expect(promote(single, () => {})).toBe(single);
    const top = company('top', 'large');
    expect(nextTier(top)).toBeNull();
    expect(promotionProgress(top)).toBeNull();
  });
});

describe('規模による上限の変化', () => {
  it('人員の上限・採用候補の数・引き合いの数・AI Worker とチームの上限が、規模で変わる', () => {
    const solo = company('caps', 'solo');
    const small = company('caps', 'small');
    // 人員：創業の2人＋1人で個人事業は満員、小規模はまだ採用できる
    const three = { ...solo, team: { ...solo.team, extra: { seat: 'standard' as const, used: 0 } } };
    expect(teamFull(three)).toBe(true);
    expect(teamFull({ ...three, tier: 'small' })).toBe(false);
    // 採用候補と引き合いの数
    expect(solo.market.candidates).toHaveLength(tierOf(solo).candidates);
    expect(small.market.candidates).toHaveLength(tierOf(small).candidates);
    expect(marketCandidates('caps', 0, tierOf(small).candidates).slice(0, tierOf(solo).candidates)).toEqual(
      solo.market.candidates,
    );
    expect(inquiriesOn('caps', 0, tierOf(small))).toHaveLength(tierOf(small).inquiries);
    // AI Worker とチーム
    expect(agentBlock(solo)).toBe('full');
    expect(agentBlock(small)).toBeNull();
    expect(teamBlock(solo)).toBe('locked');
    expect(teamBlock(small)).toBeNull();
    expect(reduce(solo, { type: 'CreateTeam' }).state).toBe(solo);
    expect(reduce(small, { type: 'CreateTeam' }).state.teams).toHaveLength(1);
  });

  it('引き合いの規模の分布は段階の重みに従う（個人事業には L・XL が来ない）', () => {
    const sizesOf = (tier: GameState['tier']) =>
      Array.from({ length: 60 }, (_, d) => inquiriesOn('sizes', d, getCompanyTier(tier)))
        .flat()
        .map((id) => id.split('~').at(-1));
    expect(new Set(sizesOf('solo'))).toEqual(new Set(['S', 'M']));
    expect(sizesOf('mid')).toContain('XL');
    expect(sizesOf('large')).not.toContain('S');
  });

  it('オフィスの固定費は規模で決まり、営業日ごとに日割りで計上し、会社の利益から引く', () => {
    const s = company('office', 'small');
    const after = step(s, DAY).state;
    expect(after.officeCost).toBeCloseTo(tierOf(s).officeDaily);
    expect(scoreCompany(after).officeCost).toBeCloseTo(after.officeCost);
    const c = scoreCompany(after);
    expect(c.profit).toBeCloseTo(c.projectProfit - c.harnessCost - c.seatCost - c.hireCost - c.idleCost - c.officeCost);
  });

  it('規模とチームはセーブを通っても同じに戻る', () => {
    let s = company('save', 'small');
    for (const c of [{ type: 'CreateTeam' }, { type: 'AddAiWorker' }] satisfies Command[]) s = reduce(s, c).state;
    const loaded = deserialize(serialize(s));
    expect(loaded).toEqual(s);
    expect(loaded.tier).toBe('small');
    expect(loaded.agents).toHaveLength(2);
  });
});

describe('ヘッドレスで会社を育てる（tests/helpers/growth.ts）', () => {
  // 大手と、その後の格付けまでの数年分は tests/balance/long-run.test.ts で確かめる（昇格は数年かけて進むように調整したため）
  it('上手に進める会社は、個人事業から中堅まで順に昇格していく', () => {
    const { state, promotions } = growCompany('grow-a', GROW_DAYS, 'human');
    console.log(
      `[会社の成長] ${GROW_DAYS}営業日・人間 PM\n` +
        promotions
          .map(
            (p) =>
              `  ${p.day}日目 → ${p.tier}：累計の利益 ${Math.round(p.profit).toLocaleString('ja-JP')} 円・評判 ${p.reputation.toFixed(0)}` +
              `・納品 ${p.delivered} 件・社員 ${p.staff} 人・AI Worker ${p.agents}・チーム ${p.teams}`,
          )
          .join('\n'),
    );
    expect(promotions.map((p) => p.from)).toEqual(['solo', 'startup', 'small']);
    expect(state.tier).toBe('mid');
    // 段階が上がるほど次の昇格までの日数は延び、人員と AI Worker が増え、管理者を置いた2つ目のチームができる
    const days = promotions.map((p) => p.day);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(Object.keys(state.team).length).toBeGreaterThan(tierOf(company()).maxStaff);
    expect(state.agents.length).toBeGreaterThan(1);
    expect(state.teams[0]?.manager?.kind).toBe('human');
  });
});
