import { balance } from '../../src/content/balance';
import { getHuman, getProject } from '../../src/content/index';
import type { AssignModeId } from '../../src/content/types';
import type { PriceStep } from '../../src/core/bidding';
import { activeProjects, openInquiries } from '../../src/core/board';
import { type Command, reduce } from '../../src/core/commands';
import type { GameEvent } from '../../src/core/events';
import { isBankrupt } from '../../src/core/funds';
import { createInitialState, type FiscalReport, type GameState, type ManagerRun } from '../../src/core/state';
import { step } from '../../src/core/step';
import { teamFull } from '../../src/core/team';
import {
  agentBlock,
  DIRECT,
  isDelegated,
  projectDelegated,
  staffBusy,
  teamAgents,
  teamBlock,
  teamProjects,
  workingStaff,
} from '../../src/core/teams';
import { tierLabel as viewTierLabel } from '../../src/view/fiscal';

/*
 * 長く遊ぶ戦略 Bot（画面なし）。チュートリアルなしで始めた会社を、方針（LongStrategy）に従って何年も経営する。
 * 毎営業日のはじめと CHUNK 分ごとに、見積・採用・AI Worker と Harness・チームと管理者・直轄の担当を決め、時間を進める。
 * 決算ごとの推移と、1ステップの処理時間・state の大きさを記録する。
 */

const DAY = balance.time.minutesPerDay;
const CHUNK = 30;
/** smart が AI に任せる AI 適性の下限（tests/helpers/strategies.ts の smart と同じ） */
const SMART_APTITUDE = 0.6;
/** Harness に投資する Bot が AI Worker に付ける部品（tests/balance/harness.test.ts の FITTED と同じ考え方） */
const FITTED = [
  'skillFrontend',
  'skillReport',
  'skillPrReview',
  'hookFormatter',
  'hookUnitTest',
  'evalUnitTest',
  'evalAcceptance',
  'toolFiles',
  'toolGit',
  'permRead',
  'permWrite',
];

export interface LongStrategy {
  readonly name: string;
  /** 直轄の担当。smart: AI 適性の高い Task は AI → 人間レビュー / human: すべて人間 / ai: すべて AI（レビューなし） */
  readonly assign: 'smart' | 'human' | 'ai';
  /** AI Worker に Harness の部品を付け、資料を必要なものに絞る */
  readonly harness: boolean;
  /** 見積の価格 */
  readonly price: PriceStep;
  /** 管理者を置ける規模になったら、チームを作ってこの管理者に任せる。null なら直轄だけ */
  readonly manager: ManagerRun['kind'] | null;
  /** 仕事が人数に比べて多ければ採用する */
  readonly hire: boolean;
  /** 社員1人あたりの進行中の案件がこれを超えたら、見積を出さない（仕事を抱えすぎない） */
  readonly loadCap: number;
  /** 引き抜きの打診に、引き留めで答える */
  readonly retain: boolean;
}

/** 上手な戦略：AI に向く仕事を任せて Harness に投資し、人間 PM に任せ、抱えすぎない */
export const skilled: LongStrategy = {
  name: '上手（smart＋Harness・人間 PM）',
  assign: 'smart',
  harness: true,
  price: 'base',
  manager: 'human',
  hire: true,
  loadCap: 0.6,
  retain: true,
};

/** 下手な戦略：すべて人間で進め、AI にも人材にも投資せず、届いた引き合いすべてに高めの見積を出す */
export const clumsy: LongStrategy = {
  name: '下手（すべて人間・投資なし）',
  assign: 'human',
  harness: false,
  price: 'plus10',
  manager: null,
  hire: false,
  loadCap: Number.POSITIVE_INFINITY,
  retain: false,
};

export interface QuarterRow {
  readonly report: FiscalReport;
  readonly tierName: string;
  /** この期に納品した案件のうち、規模 L・XL の割合 */
  readonly bigShare: number;
}

export interface LongRunResult {
  readonly strategy: LongStrategy;
  readonly state: GameState;
  readonly quarters: readonly QuarterRow[];
  /** 昇格（段階と格付け）した営業日 */
  readonly promotions: readonly { readonly day: number; readonly name: string }[];
  /** 1ステップ（tickMinutes 分）あたりの処理時間（ms）の平均と最大（CHUNK 分ずつ測った平均の最大） */
  readonly tickMs: { readonly mean: number; readonly max: number };
  /** 決算ごとの state の大きさ（JSON の文字数） */
  readonly stateSizes: readonly number[];
  /** 倒産した営業日。倒産していなければ null */
  readonly bankruptDay: number | null;
}

const apply = (s: GameState, c: Command) => reduce(s, c).state;

function modeFor(strategy: LongStrategy, aptitude: number): AssignModeId {
  if (strategy.assign === 'human') return 'human';
  if (strategy.assign === 'ai') return 'ai';
  return aptitude >= SMART_APTITUDE ? 'aiThenHumanReview' : 'human';
}

/** 直轄チームの、担当の決まっていない Task を決める */
function assignDirect(state: GameState, strategy: LongStrategy): GameState {
  let s = state;
  for (const projectId of teamProjects(s, DIRECT)) {
    for (const t of getProject(projectId).tasks) {
      if (s.projects[projectId]?.tasks[t.id]?.assignment !== null) continue;
      const mode = modeFor(strategy, t.aiAptitude);
      const agents = teamAgents(s, DIRECT);
      const agent = agents[t.id.length % Math.max(1, agents.length)] ?? s.agents[0] ?? '';
      const humans = workingStaff(s, DIRECT);
      const human = [...humans].sort((a, b) => Number(staffBusy(s, a)) - Number(staffBusy(s, b)))[0] ?? '';
      s = apply(s, { type: 'AssignTask', projectId, taskId: t.id, mode, workerId: mode === 'human' ? human : agent });
    }
  }
  return s;
}

function bid(state: GameState, strategy: LongStrategy): GameState {
  let s = state;
  const staff = Object.keys(s.team).length;
  for (const projectId of openInquiries(s)) {
    if (activeProjects(s).length > staff * strategy.loadCap) break;
    s = apply(s, { type: 'SubmitBid', projectId, price: strategy.price, deadline: 'standard' });
  }
  return s;
}

/** 進行中の案件が人数に比べて多ければ、その日の候補で一番速い人を採用する */
function hireIfNeeded(state: GameState, strategy: LongStrategy): GameState {
  if (!strategy.hire || teamFull(state)) return state;
  const active = activeProjects(state).length + openInquiries(state).length / 2;
  if (active <= Object.keys(state.team).length * 0.5) return state;
  const best = [...state.market.candidates].sort((a, b) => getHuman(b).skill - getHuman(a).skill)[0];
  return best ? apply(state, { type: 'Hire', staffId: best }) : state;
}

/** AI Worker を増やし、Harness の部品と資料の渡し方を整える */
function equipAgents(state: GameState, strategy: LongStrategy): GameState {
  if (strategy.assign === 'human') return state;
  let s = state;
  if (agentBlock(s) === null) s = apply(s, { type: 'AddAiWorker' });
  if (!strategy.harness) return s;
  for (const workerId of s.agents) {
    const parts = s.harnesses[workerId]?.parts ?? [];
    for (const partId of FITTED) if (!parts.includes(partId)) s = apply(s, { type: 'EquipPart', workerId, partId });
    if (s.sessions[workerId]?.feed.mode !== 'needed') {
      s = apply(s, { type: 'SetContextFeed', workerId, feed: { mode: 'needed' } });
    }
  }
  return s;
}

/** 管理者を置けるようになったらチームを作り、手の空いた社員の半分と AI Worker を移して管理者に任せる */
function organize(state: GameState, strategy: LongStrategy): GameState {
  const kind = strategy.manager;
  if (kind === null) return state;
  let s = state;
  while (teamBlock(s) === null) s = apply(s, { type: 'CreateTeam' });
  const teams = s.teams;
  if (teams.length === 0) return s;
  const share = Math.floor(Object.keys(s.team).length / (teams.length + 1));
  for (const team of teams) {
    for (const id of workingStaff(s, DIRECT).filter((h) => !staffBusy(s, h))) {
      const current = s.teams.find((t) => t.id === team.id);
      if (!current || current.members.filter((m) => s.team[m]).length >= share) break;
      if (workingStaff(s, DIRECT).length <= 1) break;
      s = apply(s, { type: 'MoveMember', workerId: id, teamId: team.id });
    }
    const spare = s.agents.find((id) => teamAgents(s, DIRECT).includes(id) && id !== s.agents[0] && !staffBusy(s, id));
    if (spare && teamAgents(s, team.id).length === 0)
      s = apply(s, { type: 'MoveMember', workerId: spare, teamId: team.id });
    const current = s.teams.find((t) => t.id === team.id);
    if (current && !current.manager) {
      const pm = kind === 'human' ? workingStaff(s, team.id).find((id) => !staffBusy(s, id)) : undefined;
      if (kind === 'ai' || (pm && workingStaff(s, team.id).length > 1)) {
        s = apply(s, {
          type: 'SetManager',
          teamId: team.id,
          manager: pm ? { kind: 'human', staffId: pm } : { kind: 'ai' },
        });
      }
    }
  }
  return s;
}

/** 新しく受注した直轄の案件を、仕事の少ないチームに割り当てる */
function distribute(state: GameState): GameState {
  let s = state;
  for (const projectId of teamProjects(s, DIRECT)) {
    const untouched = Object.values(s.projects[projectId]?.tasks ?? {}).every((t) => t.status === 'waiting');
    if (!untouched || projectDelegated(s, projectId)) continue;
    const load = (id: string) => teamProjects(s, id).length / Math.max(1, workingStaff(s, id).length);
    const target = s.teams
      .filter((t) => isDelegated(s, t.id) && workingStaff(s, t.id).length > 0)
      .sort((a, b) => load(a.id) - load(b.id))[0];
    if (target && load(target.id) < load(DIRECT)) s = apply(s, { type: 'MoveProject', projectId, teamId: target.id });
  }
  return s;
}

function answerOffers(state: GameState, strategy: LongStrategy): GameState {
  let s = state;
  for (const o of s.companyEvents.offers) {
    if (!o.leaving && strategy.retain) s = apply(s, { type: 'AnswerPoach', staffId: o.staffId, retain: true });
  }
  return s;
}

/** 会社を days 営業日経営する */
export function runLong(strategy: LongStrategy, seed: string, days: number): LongRunResult {
  let s = createInitialState(seed, { board: true, tutorial: false, talent: true });
  const quarters: QuarterRow[] = [];
  const promotions: { day: number; name: string }[] = [];
  const stateSizes: number[] = [];
  let tickTotal = 0;
  let tickMax = 0;
  let chunks = 0;
  let big = 0;
  let all = 0;
  while (s.clock < days * DAY && !isBankrupt(s)) {
    s = answerOffers(s, strategy);
    s = bid(s, strategy);
    s = hireIfNeeded(s, strategy);
    s = equipAgents(s, strategy);
    s = organize(s, strategy);
    s = distribute(s);
    s = assignDirect(s, strategy);
    const t0 = performance.now();
    const r = step(s, CHUNK);
    const perTick = (performance.now() - t0) / (CHUNK / balance.time.tickMinutes);
    tickTotal += perTick;
    tickMax = Math.max(tickMax, perTick);
    chunks++;
    s = r.state;
    for (const e of r.events) record(e, r.state);
  }
  function record(e: GameEvent, state: GameState) {
    if (e.type === 'ProjectCompleted') {
      const size = getProject(e.projectId).brief?.size;
      all++;
      if (size === 'L' || size === 'XL') big++;
    }
    if (e.type === 'FiscalClosed') {
      const report = state.fiscal.reports.at(-1);
      if (report) quarters.push({ report, tierName: tierLabel(state, report), bigShare: all > 0 ? big / all : 0 });
      stateSizes.push(JSON.stringify(state).length);
      big = 0;
      all = 0;
    }
    if (e.type === 'CompanyPromoted' || e.type === 'CompanyRanked') {
      promotions.push({ day: Math.floor(state.clock / DAY), name: tierLabel(state) });
    }
  }
  return {
    strategy,
    state: s,
    quarters,
    promotions,
    tickMs: { mean: tickTotal / Math.max(1, chunks), max: tickMax },
    stateSizes,
    bankruptDay: s.funds.bankruptAt === null ? null : Math.floor(s.funds.bankruptAt / DAY),
  };
}

/** 規模の表示名（格付けの ★ を含む）。report があればその期末の規模 */
function tierLabel(state: GameState, report?: FiscalReport): string {
  return report ? viewTierLabel(report.tier, report.rank) : viewTierLabel(state.tier, state.rank);
}
