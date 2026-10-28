import { describe, expect, it } from 'vitest';
import { balance } from '../../src/content/balance';
import { getHuman, getProject } from '../../src/content/index';
import { archivable, archiveProjects } from '../../src/core/archive';
import { catchUp } from '../../src/core/away';
import { industryTrack, winChance } from '../../src/core/bidding';
import { reduce } from '../../src/core/commands';
import { goalProgress, promote, rankProgress, tierOf } from '../../src/core/company';
import { answerPoach, dailyCompanyEvents, outageChance, priceWarCut, retainBonus } from '../../src/core/companyEvents';
import { holds } from '../../src/core/conditions';
import type { GameEvent } from '../../src/core/events';
import { companyTotals, fiscalReport } from '../../src/core/fiscal';
import { addSample, cashOf, isBankrupt, valuationOf } from '../../src/core/funds';
import { generatedProjectId } from '../../src/core/projectGen';
import { decodeFiscalCode, decodeResultCode, encodeFiscalCode, type FiscalRecord } from '../../src/core/resultCode';
import { scoreCompany } from '../../src/core/scoring';
import { deserialize, MIGRATIONS, OutdatedSaveError, SAVE_VERSION, serialize } from '../../src/core/serialize';
import { createFunds, createInitialState, createTaskRun, type GameState } from '../../src/core/state';
import { step } from '../../src/core/step';
import { recapView } from '../../src/view/session';
import { growCompany } from '../helpers/growth';
import { campaignInProgress } from '../helpers/session';

const DAY = balance.time.minutesPerDay;
const FISCAL = balance.fiscal.days;

/** チュートリアルなしで始めた会社 */
const company = (seed = 'fiscal', tier: GameState['tier'] = 'solo') =>
  createInitialState(seed, { board: true, tutorial: false, talent: true, tier });

/** 資金に余裕のある会社（案件がなくても期末まで倒産しない）。期首の累計も合わせる */
function rich(state: GameState): GameState {
  const s = { ...state, idleCost: state.idleCost - 1_000_000_000 };
  return { ...s, fiscal: { ...s.fiscal, opening: companyTotals(s) } };
}

function run(state: GameState, minutes: number): { state: GameState; events: GameEvent[] } {
  const r = step(state, minutes);
  return { state: r.state, events: [...r.events] };
}

describe('決算（core/fiscal.ts）', () => {
  it('チュートリアルなしの会社は0日目から期を数え、60営業日ごとに締めて FiscalClosed を出す', () => {
    expect(company().fiscal).toMatchObject({ no: 1, startDay: 0, reports: [] });
    const s = rich(company());
    const before = run(s, FISCAL * DAY - 1);
    expect(before.events.some((e) => e.type === 'FiscalClosed')).toBe(false);
    const { state, events } = run(before.state, 1);
    expect(events).toContainEqual({ type: 'FiscalClosed', no: 1 });
    const report = state.fiscal.reports[0];
    expect(report).toMatchObject({ no: 1, startDay: 0, endDay: FISCAL, tier: s.tier, rank: 0 });
    // 期の数字は期首と期末の累計の差。次の期は期末の累計から始まる
    // （期末のステップの残りの費用は次の期に入るので、次の期首の累計と比べる。取りこぼしはない）
    expect(report?.profit).toBeCloseTo(state.fiscal.opening.profit - s.fiscal.opening.profit);
    expect(state.fiscal.opening.profit).toBeCloseTo(scoreCompany(state).profit, -3);
    expect(state.fiscal).toMatchObject({ no: 2, startDay: FISCAL, teams: {}, best: null, achievements: [] });
  });

  it('チュートリアル中・単発のプレイは期を数えず、チュートリアルを終えた次の営業日から数え始める', () => {
    const tutorial = createInitialState('tutorial', { board: true });
    expect(tutorial.fiscal.startDay).toBeNull();
    expect(run(tutorial, DAY * 2).state.fiscal.startDay).toBeNull();
    const ended = run({ ...tutorial, tutorial: null }, DAY * 3).state;
    expect(ended.fiscal.startDay).toBe(1);
    const single = run(createInitialState('single'), DAY * (FISCAL + 1)).state;
    expect(single.fiscal).toMatchObject({ startDay: null, reports: [] });
  });

  it('納品した案件は期の集計（チームごと・いちばん良かった / 悪かった案件）に入り、決算に残る', () => {
    const { state } = growCompany('fiscal-grow', FISCAL + 1);
    const report = state.fiscal.reports[0];
    if (!report) throw new Error('決算がない');
    const teamDelivered = Object.values(report.teams).reduce((sum, t) => sum + t.delivered, 0);
    expect(teamDelivered).toBe(report.delivered);
    expect(report.delivered).toBeGreaterThan(0);
    expect(report.best?.profitPerPersonDay).toBeGreaterThanOrEqual(report.worst?.profitPerPersonDay ?? 0);
    expect(report.revenue).toBeGreaterThan(report.profit);
    expect(report.achievements).toContain('firstDelivery');
  });

  it('決算は keep 期まで残し、古いものから捨てる', () => {
    let s = rich(company('keep'));
    const keep = balance.fiscal.keep;
    s = {
      ...s,
      fiscal: { ...s.fiscal, reports: Array.from({ length: keep }, (_, i) => ({ ...fiscalReport(s), no: i + 1 })) },
    };
    const { state } = run(s, FISCAL * DAY);
    expect(state.fiscal.reports).toHaveLength(keep);
    expect(state.fiscal.reports[0]?.no).toBe(2);
  });

  it('決算の結果コードは元に戻り、1文字の写し間違いを見つけ、案件の結果コードとは見分けられる', () => {
    const record: FiscalRecord = {
      seed: 'run-abc',
      no: 7,
      revenue: 512_340_000,
      profit: -1_234_000,
      profitPerPersonDay: 1_234_567,
      humanMinutes: 98_765,
      delivered: 143,
      reputation: 88,
      tier: 'mid',
      rank: 0,
      valuation: 9_876_543_210,
    };
    const code = encodeFiscalCode(record);
    expect(decodeFiscalCode(code)).toEqual({ ok: true, record, sameBuild: true });
    const chars = code.replace(/-/g, '');
    for (const i of [0, 5, chars.length - 1]) {
      const changed = chars.slice(0, i) + (chars[i] === 'A' ? 'B' : 'A') + chars.slice(i + 1);
      expect(decodeFiscalCode(changed).ok, `${i}文字目`).toBe(false);
    }
    expect(decodeFiscalCode(encodeFiscalCode(record, { version: 9 }))).toEqual({ ok: false, error: 'version' });
    expect(decodeResultCode(code).ok).toBe(false);
  });
});

describe('累計の記録（core/archive.ts）', () => {
  it('納品から keepDays 営業日たった案件を記録に移しても、会社のスコア・解放の条件・コンペの実績は変わらない', () => {
    // 引き合いが当日に締め切られるようになり（Phase 24）、手元の納品済みが4件以上になるまで 24日育てる
    const { state } = growCompany('archive', 24);
    const all = Object.values(state.projects)
      .filter((p) => p.completedAt !== null)
      .map((p) => p.projectId);
    expect(all.length).toBeGreaterThan(3);
    const archived = archiveProjects(state, all);
    expect(Object.keys(archived.projects).length).toBe(Object.keys(state.projects).length - all.length);
    const a = scoreCompany(state);
    const b = scoreCompany(archived);
    expect(b.delivered).toBe(a.delivered);
    expect(b.revenue).toBeCloseTo(a.revenue);
    expect(b.profit).toBeCloseTo(a.profit);
    expect(b.humanMinutes).toBeCloseTo(a.humanMinutes);
    for (const c of [
      { type: 'projectsCompleted', count: a.delivered },
      { type: 'tasksCompleted', count: 10 },
      { type: 'modeCompleted', mode: 'aiThenHumanReview', count: 1 },
    ] as const) {
      expect(holds(archived, c)).toBe(holds(state, c));
    }
    const def = getProject(all[0] ?? '');
    expect(industryTrack(archived, def)).toBe(industryTrack(state, def));
  });

  it('営業日の始まりに、納品から日のたった案件だけを移す（直近の案件は画面で見せるため残す）', () => {
    const { state } = growCompany('archive-day', 10);
    for (const id of archivable(state)) {
      const at = state.projects[id]?.completedAt ?? 0;
      expect(Math.floor(state.clock / DAY) - Math.floor(at / DAY)).toBeGreaterThanOrEqual(balance.archive.keepDays);
    }
    const recent = Object.values(state.projects).filter(
      (p) => p.completedAt !== null && Math.floor(p.completedAt / DAY) >= Math.floor(state.clock / DAY) - 1,
    );
    for (const p of recent) expect(archivable(state)).not.toContain(p.projectId);
    expect(state.ledger.delivered).toBeGreaterThan(0);
  });
});

describe('資金と倒産・時価総額（core/funds.ts）', () => {
  it('資金は開業資金に会社の累計の利益を足したもの', () => {
    const s = company('cash');
    expect(cashOf(s)).toBe(balance.funds.initial);
    const later = run(s, DAY * 5).state;
    expect(cashOf(later)).toBeCloseTo(balance.funds.initial + scoreCompany(later).profit);
  });

  it('資金がマイナスなら毎日警告し、graceDays 営業日続くと倒産する。倒産した会社は時間も Command も止まる', () => {
    const s = { ...company('broke'), idleCost: balance.funds.initial + 1 };
    const { state, events } = run(s, DAY * (balance.funds.graceDays + 3));
    const shorts = events.filter((e) => e.type === 'CashShort');
    expect(shorts).toHaveLength(balance.funds.graceDays - 1);
    expect(events.filter((e) => e.type === 'CompanyBankrupt')).toHaveLength(1);
    expect(isBankrupt(state)).toBe(true);
    expect(state.paused).toBe(true);
    expect(state.funds.bankruptAt).toBe(DAY * balance.funds.graceDays);
    expect(state.funds.samples.at(-1)?.day).toBe(balance.funds.graceDays);
    const resumed = { ...state, paused: false };
    expect(step(resumed, DAY).state).toBe(resumed);
    expect(reduce(resumed, { type: 'TogglePause' }).state).toBe(resumed);
  });

  it('資金が持ち直せば、倒産までの日数は元に戻る', () => {
    const s = { ...company('recover'), idleCost: balance.funds.initial + 1 };
    const short = run(s, DAY * 2).state;
    expect(short.funds.shortDays).toBe(2);
    const healed = run({ ...short, idleCost: 0 }, DAY).state;
    expect(healed.funds.shortDays).toBe(0);
  });

  it('時価総額は資金と直近の利益のペースで決まり、推移は上限を超えると間引いて間隔を広げる', () => {
    const s = company('value');
    expect(valuationOf(s)).toBe(balance.funds.initial);
    let funds = createFunds();
    for (let day = 0; day < 1000; day++) funds = addSample(funds, { day, valuation: day, cash: day, profit: day });
    expect(funds.samples.length).toBeLessThanOrEqual(balance.valuation.maxSamples);
    expect(funds.sampleEvery).toBeGreaterThan(balance.valuation.sampleDays);
    expect(funds.samples.at(-1)?.day).toBe(999);
    // 利益が出ていれば、時価総額は資金より大きい
    const grown = growCompany('value-grow', 20).state;
    expect(valuationOf(grown)).toBeGreaterThan(cashOf(grown));
  });
});

describe('後半の事件（core/companyEvents.ts）', () => {
  it('競合の値下げの間は、同じ見積でも勝率が下がる', () => {
    const s = company('war', 'mid');
    const def = getProject(generatedProjectId('war-1', 'M'));
    const amount = def.revenue;
    const war = { ...s, companyEvents: { ...s.companyEvents, priceWarUntil: s.clock + DAY } };
    expect(priceWarCut(war)).toBe(balance.companyEvents.priceWar.priceCut);
    expect(winChance(war, def, amount, def.deadlineDays)).toBeLessThan(winChance(s, def, amount, def.deadlineDays));
  });

  it('引き抜きの打診：引き留めると賞与を払って残り、見送ると（手が空いていれば）すぐ退職する', () => {
    const s = company('poach', 'small');
    const staffId = Object.keys(s.team)[0] ?? '';
    const offered = {
      ...s,
      companyEvents: { ...s.companyEvents, offers: [{ staffId, deadline: DAY, leaving: false }] },
    };
    const kept = reduce(offered, { type: 'AnswerPoach', staffId, retain: true });
    expect(kept.events).toContainEqual({ type: 'PoachAnswered', staffId, retained: true });
    expect(kept.state.eventCost).toBe(retainBonus(staffId));
    expect(retainBonus(staffId)).toBe(getHuman(staffId).dailyRate * balance.companyEvents.poach.retainDays);
    expect(kept.state.team[staffId]).toBeDefined();
    expect(kept.state.companyEvents.offers).toEqual([]);
    const events: GameEvent[] = [];
    const gone = answerPoach(offered, staffId, false, (e) => events.push(e));
    expect(gone.team[staffId]).toBeUndefined();
    expect(gone.companyEvents.poached).toBe(1);
    expect(events).toContainEqual({ type: 'StaffPoached', staffId });
  });

  it('返事をしないまま期限が過ぎたら、次の営業日の始まりに退職する', () => {
    const s = company('poach-deadline', 'small');
    const staffId = Object.keys(s.team)[0] ?? '';
    const offered = {
      ...s,
      companyEvents: { ...s.companyEvents, offers: [{ staffId, deadline: DAY, leaving: false }] },
    };
    const { state, events } = run(offered, DAY);
    expect(events).toContainEqual({ type: 'StaffPoached', staffId });
    expect(state.team[staffId]).toBeUndefined();
  });

  it('引き抜きは「小規模」から、売値の最も高い社員に来る（seed と営業日で決まる）', () => {
    const solo = company('poach-roll', 'solo');
    const small = company('poach-roll', 'small');
    const offers = (s: GameState) => {
      const out: string[] = [];
      for (let day = 1; day <= 200; day++) {
        dailyCompanyEvents({ ...s, clock: day * DAY }, (e) => e.type === 'PoachOffered' && out.push(e.staffId));
      }
      return out;
    };
    expect(offers(solo)).toEqual([]);
    const got = offers(small);
    expect(got.length).toBeGreaterThan(0);
    const top = Object.keys(small.team).sort((a, b) => getHuman(b).dailyRate - getHuman(a).dailyRate)[0];
    expect(new Set(got)).toEqual(new Set([top]));
  });

  it('大規模障害は規模 L・XL の案件で、見逃した失敗が多いほど起きやすい（小さい案件・小さい会社では起きない）', () => {
    const s = company('outage', 'mid');
    const withEscapes = (projectId: string, escaped: number): GameState => {
      const tasks = Object.fromEntries(
        getProject(projectId).tasks.map((t, i) => [
          t.id,
          { ...createTaskRun(), status: 'done' as const, escaped: i < escaped },
        ]),
      );
      const run = {
        projectId,
        startedAt: 0,
        completedAt: 0,
        revenue: 1,
        deadlineDays: 1,
        tasks,
        management: { minutes: 0, laborCost: 0, aiCost: 0, playerAssigned: 0 },
      };
      return { ...s, projects: { [projectId]: run } };
    };
    const l = generatedProjectId('outage-l', 'L');
    const m = generatedProjectId('outage-m', 'M');
    expect(outageChance(withEscapes(l, 0), l)).toBe(0);
    expect(outageChance(withEscapes(l, 1), l)).toBeCloseTo(balance.companyEvents.outage.perEscaped);
    expect(outageChance(withEscapes(l, 20), l)).toBe(balance.companyEvents.outage.max);
    expect(outageChance(withEscapes(m, 3), m)).toBe(0);
    expect(outageChance({ ...withEscapes(l, 3), tier: 'startup' }, l)).toBe(0);
  });
});

describe('格付け（大手の後も続く昇格）', () => {
  it('大手で条件を満たすと格付けが上がり（CompanyRanked）、オフィスの固定費と XL の引き合いが増える', () => {
    const top = company('rank', 'large');
    expect(rankProgress(company('rank', 'mid'))).toBeNull();
    const need = rankProgress(top);
    if (!need) throw new Error('格付けの条件がない');
    expect(goalProgress(top)).toEqual(need);
    expect(need.tier.name).toBe(tierOf({ ...top, rank: 1 }).name);
    const ready: GameState = {
      ...top,
      reputation: need.reputation.need,
      ledger: { ...top.ledger, delivered: need.delivered.need, projectProfit: need.profit.need * 2 },
    };
    const events: GameEvent[] = [];
    const ranked = promote(ready, (e) => events.push(e));
    expect(ranked.rank).toBeGreaterThanOrEqual(1);
    expect(events[0]).toEqual({ type: 'CompanyRanked', rank: 1 });
    expect(tierOf(ranked).name).toContain('★');
    expect(tierOf(ranked).officeDaily).toBeGreaterThan(tierOf(top).officeDaily);
    expect(tierOf(ranked).sizes.XL).toBeGreaterThan(tierOf(top).sizes.XL);
    // 次の格付けの条件は、さらに上がる
    expect(rankProgress(ranked)?.profit.need).toBeGreaterThan(need.profit.need);
  });
});

describe('セーブと閉じている間の進行', () => {
  it('v12 のセーブを v13 に変換できる（記録は空・期は次の営業日から・資金は開業資金から）。時計の単位が違うのでv14 以降の形式には読み込まない', () => {
    const s = company('migrate');
    const { rank, eventCost, ledger, fiscal, funds, achievements, companyEvents, ...v12 } = s;
    const json = JSON.stringify({ saveVersion: 12, state: v12 });
    expect(SAVE_VERSION).toBe(19);
    expect(() => deserialize(json)).toThrow(OutdatedSaveError);
    const loaded = deserialize(json, MIGRATIONS, 13);
    expect(loaded).toMatchObject({ rank: 0, eventCost: 0, achievements: [] });
    expect(loaded.fiscal.startDay).toBeNull();
    expect(loaded.ledger.delivered).toBe(0);
    expect(cashOf(loaded)).toBe(balance.funds.initial);
    expect([rank, eventCost, ledger, fiscal, funds, achievements, companyEvents]).toHaveLength(7);
  });

  it('長く進めた会社（決算・記録・推移・実績）もセーブを通って同じに戻る', () => {
    const { state } = growCompany('save-long', FISCAL + 2);
    expect(state.fiscal.reports.length).toBe(1);
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it('閉じている間に期末を迎えたら決算を締め、あらすじで知らせる', () => {
    const start = campaignInProgress('away-fiscal');
    const before = { ...start, clock: FISCAL * DAY - 60, fiscal: { ...start.fiscal, startDay: 0 } };
    const { state, events } = catchUp(before, 24 * 60 * 60);
    expect(events).toContainEqual({ type: 'FiscalClosed', no: 1 });
    expect(recapView(before, state, events).fiscalClosed).toBe(1);
  });
});
