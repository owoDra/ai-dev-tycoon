import { balance } from '../content/balance';
import { companyTiers } from '../content/companyTiers';
import { getHuman, getProject } from '../content/index';
import type { CompanyTierId, ProjectSize } from '../content/types';
import { businessDay } from './clock';
import type { GameEvent } from './events';
import { companyRunning } from './funds';
import { chance, hashSeed } from './rng';
import type { GameState, PoachRun } from './state';
import { release, releaseBlock } from './team';

/*
 * 後半の事件（企画書の「後半の要素」）。会社が育つと、大規模障害・人材の引き抜き・競合の値下げが起きる（balance.companyEvents）。
 * 起きるかどうかは seed と営業日・案件から決める（state の乱数を引かないので、ほかの結果の並びを変えない）。
 */

const DAY = balance.time.minutesPerDay;
const BIG_SIZES: readonly ProjectSize[] = ['L', 'XL'];

/** 会社の規模がその段階以上か */
export function tierAtLeast(state: GameState, tier: CompanyTierId): boolean {
  const index = (id: CompanyTierId) => companyTiers.findIndex((t) => t.id === id);
  return index(state.tier) >= index(tier);
}

/** seed とキーから決まる試行 */
const roll = (state: GameState, key: string, p: number) => chance(hashSeed(`${state.seed}:event:${key}`), p)[0];

/** 大規模障害の確率。規模 L・XL の案件で、見逃した失敗の Task の数に比例する */
export function outageChance(state: GameState, projectId: string): number {
  const o = balance.companyEvents.outage;
  const run = state.projects[projectId];
  const size = getProject(projectId).brief?.size;
  if (!run || size === undefined || !BIG_SIZES.includes(size) || !tierAtLeast(state, o.minTier)) return 0;
  const escaped = Object.values(run.tasks).filter((t) => t.escaped).length;
  return Math.min(o.max, escaped * o.perEscaped);
}

/** 納品した案件で大規模障害が起きるか判定し、起きたら損害と評判の低下を与える */
export function rollOutage(state: GameState, projectId: string, emit: (e: GameEvent) => void): GameState {
  const p = outageChance(state, projectId);
  const run = state.projects[projectId];
  if (!run || p <= 0 || !roll(state, `outage:${projectId}`, p)) return state;
  const o = balance.companyEvents.outage;
  const cost = Math.round(run.revenue * o.costShare);
  const reputation = Math.max(balance.reputation.min, state.reputation - o.reputation);
  emit({ type: 'OutageOccurred', projectId, cost, reputation: reputation - state.reputation });
  return {
    ...state,
    eventCost: state.eventCost + cost,
    reputation,
    companyEvents: { ...state.companyEvents, outages: state.companyEvents.outages + 1 },
  };
}

/** 競合の値下げで、競合の価格の比から引く量（値下げしていなければ 0） */
export function priceWarCut(state: GameState): number {
  const until = state.companyEvents.priceWarUntil;
  return until !== null && until > state.clock ? balance.companyEvents.priceWar.priceCut : 0;
}

/** 引き抜きの打診 */
export const poachOffer = (state: GameState, staffId: string): PoachRun | undefined =>
  state.companyEvents.offers.find((o) => o.staffId === staffId);

/** 引き留めの賞与（円）。売値の retainDays 人日分 */
export const retainBonus = (staffId: string) => getHuman(staffId).dailyRate * balance.companyEvents.poach.retainDays;

const setOffers = (state: GameState, offers: readonly PoachRun[]): GameState => ({
  ...state,
  companyEvents: { ...state.companyEvents, offers },
});

/** 退職が決まった社員を、仕事を抱えていなければ退職させる。会社にいない・最後の1人なら打診を取り下げる */
function settleLeaving(state: GameState, emit: (e: GameEvent) => void): GameState {
  let next = state;
  for (const offer of state.companyEvents.offers) {
    if (!offer.leaving) continue;
    const block = releaseBlock(next, offer.staffId);
    if (block === 'busy') continue;
    const rest = next.companyEvents.offers.filter((o) => o.staffId !== offer.staffId);
    if (block !== null) {
      next = setOffers(next, rest);
      continue;
    }
    next = release(setOffers(next, rest), offer.staffId);
    next = { ...next, companyEvents: { ...next.companyEvents, poached: next.companyEvents.poached + 1 } };
    emit({ type: 'StaffPoached', staffId: offer.staffId });
  }
  return next;
}

/**
 * 引き抜きの打診に返事をする。引き留めるなら賞与を払って打診を取り下げ、見送るなら退職が決まる（手が空いていればすぐ退職する）。
 * 打診がない・もう退職が決まっていれば state をそのまま返す
 */
export function answerPoach(
  state: GameState,
  staffId: string,
  retain: boolean,
  emit: (e: GameEvent) => void,
): GameState {
  const offer = poachOffer(state, staffId);
  if (!offer || offer.leaving) return state;
  emit({ type: 'PoachAnswered', staffId, retained: retain });
  if (retain) {
    const offers = state.companyEvents.offers.filter((o) => o.staffId !== staffId);
    return { ...setOffers(state, offers), eventCost: state.eventCost + retainBonus(staffId) };
  }
  const offers = state.companyEvents.offers.map((o) => (o.staffId === staffId ? { ...o, leaving: true } : o));
  return settleLeaving(setOffers(state, offers), emit);
}

/** 打診の対象（売値の最も高い社員。打診中の人は除く）。社員が minStaff 人に満たなければ null */
function poachTarget(state: GameState): string | null {
  const staff = Object.keys(state.team);
  if (staff.length < balance.companyEvents.poach.minStaff) return null;
  const candidates = staff.filter((id) => !poachOffer(state, id));
  return [...candidates].sort((a, b) => getHuman(b).dailyRate - getHuman(a).dailyRate)[0] ?? null;
}

/**
 * 営業日の始まりの後半の事件。値下げの終わりと始まり、引き抜きの期限切れと退職、新しい打診を判定する
 */
export function dailyCompanyEvents(state: GameState, emit: (e: GameEvent) => void): GameState {
  if (!companyRunning(state)) return state;
  const e = balance.companyEvents;
  const day = businessDay(state.clock);
  let next = state;

  const until = next.companyEvents.priceWarUntil;
  if (until !== null && until <= next.clock) {
    next = { ...next, companyEvents: { ...next.companyEvents, priceWarUntil: null } };
    emit({ type: 'PriceWarChanged', active: false });
  }
  if (
    next.companyEvents.priceWarUntil === null &&
    tierAtLeast(next, e.priceWar.minTier) &&
    roll(next, `priceWar:${day}`, e.priceWar.perDay)
  ) {
    next = { ...next, companyEvents: { ...next.companyEvents, priceWarUntil: next.clock + e.priceWar.days * DAY } };
    emit({ type: 'PriceWarChanged', active: true });
  }

  const offers = next.companyEvents.offers.map((o) =>
    !o.leaving && o.deadline <= next.clock ? { ...o, leaving: true } : o,
  );
  next = settleLeaving(setOffers(next, offers), emit);

  if (tierAtLeast(next, e.poach.minTier) && roll(next, `poach:${day}`, e.poach.perDay)) {
    const staffId = poachTarget(next);
    if (staffId !== null) {
      const offer: PoachRun = { staffId, deadline: next.clock + e.poach.noticeDays * DAY, leaving: false };
      next = setOffers(next, [...next.companyEvents.offers, offer]);
      emit({ type: 'PoachOffered', staffId });
    }
  }
  return next;
}
