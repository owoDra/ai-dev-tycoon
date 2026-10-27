import { balance } from '../content/balance';
import { tutorialScript } from '../content/tutorial';
import type { CompanyTierDef, ProjectSize } from '../content/types';
import { closeInquiries } from './bidding';
import { businessDay } from './clock';
import { tierOf } from './company';
import type { GameEvent } from './events';
import { generatedProjectId } from './projectGen';
import { hashSeed, weighted } from './rng';
import type { GameState } from './state';
import type { System } from './system';

/*
 * 案件ボード。チュートリアルを終えた会社には、営業日ごとに引き合い（生成した案件）が届く。
 * 引き合いには応募の締切があり、締切に見積のコンペの結果が出る（core/bidding.ts）。
 * 届く案件は、ゲームの seed と営業日から決まる（state の乱数は使わない）。
 */

/** その営業日に届く引き合いの案件の id（数と規模の分布は会社の規模で決まる） */
export function inquiriesOn(gameSeed: string, day: number, tier: CompanyTierDef): string[] {
  const sizes = Object.entries(tier.sizes) as [ProjectSize, number][];
  return Array.from({ length: tier.inquiries }, (_, i) => {
    const key = `${gameSeed}:board:${day}:${i}`;
    const [size] = weighted(
      hashSeed(`${key}:size`),
      sizes.map(([item, weight]) => ({ item, weight })),
    );
    return generatedProjectId(String(hashSeed(key)), size);
  });
}

/** 始めていて、まだ納品していない案件（始めた順） */
export function activeProjects(state: GameState): string[] {
  return Object.values(state.projects)
    .filter((p) => p.completedAt === null)
    .map((p) => p.projectId);
}

/** 案件を直接始められるか。案件ボードのある会社では、チュートリアルの間のチュートリアルの案件だけ（ほかはコンペで受注する） */
export function canStartProject(state: GameState, projectId: string): boolean {
  if (state.projects[projectId]) return false;
  return state.board === null || (state.tutorial !== null && projectId === tutorialScript.projectId);
}

/** 応募の締切前で、まだ見積を出していない引き合い */
export function openInquiries(state: GameState): string[] {
  return (state.board?.inquiries ?? []).filter((i) => i.bid === null).map((i) => i.projectId);
}

/** 見積を出して、結果を待っている引き合い */
export function pendingBids(state: GameState): string[] {
  return (state.board?.inquiries ?? []).filter((i) => i.bid !== null).map((i) => i.projectId);
}

/** チュートリアルを終えた会社に、今日の引き合いが届いていなければ届ける。Command の適用後と各ステップの最後に判定する */
export function postInquiries(state: GameState, emit: (e: GameEvent) => void): GameState {
  const board = state.board;
  const day = businessDay(state.clock);
  if (!board || state.tutorial !== null || board.day === day) return state;
  const closesAt = (day + balance.board.closeDays) * balance.time.minutesPerDay;
  const projectIds = inquiriesOn(state.seed, day, tierOf(state)).filter(
    (id) => !state.projects[id] && !board.inquiries.some((i) => i.projectId === id),
  );
  emit({ type: 'InquiriesPosted', projectIds });
  const posted = projectIds.map((projectId) => ({ projectId, postedDay: day, closesAt, bid: null }));
  return { ...state, board: { ...board, day, inquiries: [...board.inquiries, ...posted] } };
}

/** 締切を迎えた引き合いの結果を出す */
export const boardSystem: System = (state, ctx) => closeInquiries(state, () => ctx.rng.next(), ctx.emit);
