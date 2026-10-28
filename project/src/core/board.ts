import { balance } from '../content/balance';
import { getProject } from '../content/index';
import { tutorialScript } from '../content/tutorial';
import type { CompanyTierDef, ProjectSize } from '../content/types';
import { businessDay } from './clock';
import { tierOf } from './company';
import type { GameEvent } from './events';
import { expireInquiries } from './orders';
import { generatedProjectId } from './projectGen';
import { hashSeed, weighted } from './rng';
import type { GameState } from './state';
import type { System } from './system';

/*
 * 案件ボード。チュートリアルを終えた会社には、営業日ごとに引き合い（生成した案件）が届く。
 * 引き合いは選べば必ず受注できる（core/orders.ts）。受付の締切（規模に応じて数営業日後の夕方）を過ぎるとボードから消える。
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

/**
 * その時刻に届いた引き合いの応募の締切（ゲーム内時刻）。届いた営業日から数えて days 営業日目の balance.board.closeAt の時刻で、
 * 届いた営業日の締切までの残りが minOpenMinutes 未満なら1営業日遅らせる
 */
export function closingTime(clock: number, days = 1): number {
  const { closeAt, minOpenMinutes } = balance.board;
  const day = balance.time.minutesPerDay;
  // 営業日は始業（balance.time.origin）から始まるので、締切の時刻を営業日の頭からの分に直す
  const offset = (((closeAt - balance.time.origin) % day) + day) % day;
  const today = businessDay(clock) * day + offset;
  const first = today - clock >= minOpenMinutes ? today : today + day;
  return first + (Math.max(1, days) - 1) * day;
}

/** 引き合いの応募の期間（営業日）。案件の規模で決まる（balance.board.closeDays） */
export function closeDaysOf(projectId: string): number {
  const size = getProject(projectId).brief?.size;
  return size ? balance.board.closeDays[size] : 1;
}

/** 始めていて、まだ納品していない案件（始めた順） */
export function activeProjects(state: GameState): string[] {
  return Object.values(state.projects)
    .filter((p) => p.completedAt === null)
    .map((p) => p.projectId);
}

/** 案件を直接始められるか。案件ボードのある会社では、チュートリアルの間のチュートリアルの案件だけ（ほかは引き合いから受注する。core/orders.ts） */
export function canStartProject(state: GameState, projectId: string): boolean {
  if (state.projects[projectId]) return false;
  return state.board === null || (state.tutorial !== null && projectId === tutorialScript.projectId);
}

/** 受付の締切前で、まだ受注していない引き合い */
export function openInquiries(state: GameState): string[] {
  return (state.board?.inquiries ?? []).map((i) => i.projectId);
}

/** チュートリアルを終えた会社に、今日の引き合いが届いていなければ届ける。Command の適用後と各ステップの最後に判定する */
export function postInquiries(state: GameState, emit: (e: GameEvent) => void): GameState {
  const board = state.board;
  const day = businessDay(state.clock);
  if (!board || state.tutorial !== null || board.day === day) return state;
  const projectIds = inquiriesOn(state.seed, day, tierOf(state)).filter(
    (id) => !state.projects[id] && !board.inquiries.some((i) => i.projectId === id),
  );
  emit({ type: 'InquiriesPosted', projectIds });
  const posted = projectIds.map((projectId) => ({
    projectId,
    postedDay: day,
    closesAt: closingTime(state.clock, closeDaysOf(projectId)),
  }));
  return { ...state, board: { ...board, day, inquiries: [...board.inquiries, ...posted] } };
}

/** 受付の締切を過ぎた引き合いを消す */
export const boardSystem: System = (state) => expireInquiries(state);
