import { ja } from '../i18n/ja';
import type { SeatDef, SeatId } from './types';

/**
 * Claude Team のシート（企画書6章）。価格は企画書の米国価格（月払い）で、ゲーム内の円への換算は balance.seat。
 * 会社が種類ごとに好きな枚数を買い（人の数とは関係ない）、AI Worker と AI PM は買った枚数の使用量の合計の範囲でしか動かない。
 * Premium は Standard の5倍の費用で5倍の使用量を持つ。使い切る量より多く買っても速くはならず、固定費だけが増える
 * （「AI の容量をどれだけ買うか」）
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
