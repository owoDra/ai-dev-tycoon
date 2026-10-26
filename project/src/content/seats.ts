import { ja } from '../i18n/ja';
import type { SeatDef, SeatId } from './types';

/**
 * Claude Team のシート（企画書6章）。価格は企画書の米国価格（月払い）で、ゲーム内の円への換算は balance.seat。
 * Premium は Standard の5倍の費用で5倍の使用量を持つ。使用量を使い切るのは AI Worker を運用する人だけなので、
 * 全員を Premium にしても速くはならず、固定費だけが増える（「誰に高価な AI 容量を割り当てるか」）
 */
export const seats: readonly SeatDef[] = [
  { id: 'standard', name: ja.seats.standard, monthlyUsd: 25, dailyUsage: 150 },
  { id: 'premium', name: ja.seats.premium, monthlyUsd: 125, dailyUsage: 750 },
];

export function getSeat(id: SeatId): SeatDef {
  const s = seats.find((x) => x.id === id);
  if (!s) throw new Error(`未定義の Seat: ${id}`);
  return s;
}
