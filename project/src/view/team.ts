import { aiWorkers, getModel } from '../content/index';
import { seats } from '../content/seats';
import type { SeatId } from '../content/types';
import type { Command } from '../core/commands';
import { harnessOf } from '../core/harness';
import type { GameState } from '../core/state';
import { operatedWorkers, overLimit, seatMonthlyCost, seatOf, teamMembers } from '../core/team';
import { isUnlocked } from '../core/unlocks';
import { ja } from '../i18n/ja';

/** Seat を変えたときの差分（企画書47章「AI 容量 +400% / 費用 +¥XX,XXX / 月」） */
export interface SeatPreview {
  /** AI 容量（1営業日の使用量の上限）の変化率。+4 で +400% */
  readonly capacity: number;
  /** 月額の差（円） */
  readonly monthlyCost: number;
}

/** 社員の Seat の選択肢 */
export interface SeatOptionView {
  readonly id: SeatId;
  readonly label: string;
  readonly selected: boolean;
  /** 選んだときの差分。選択中なら null */
  readonly preview: SeatPreview | null;
  readonly command: Command | null;
}

export interface MemberView {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  /** 得意分野の名前（なければ空） */
  readonly strengths: readonly string[];
  /** AI Worker を運用している（Seat の使用量を使う） */
  readonly operator: boolean;
  /** 今日の使用量と上限。運用していなければ null */
  readonly usage: { readonly used: number; readonly limit: number; readonly over: boolean } | null;
  readonly monthlyCost: number;
  readonly options: readonly SeatOptionView[];
}

export interface TeamView {
  readonly members: readonly MemberView[];
  /** Seat の固定費の合計（円/月） */
  readonly monthlyTotal: number;
  /** Seat を変えられるか（解放済み） */
  readonly editable: boolean;
  /** AI Worker の Model と、1分あたりの使用量 */
  readonly model: { readonly name: string; readonly usagePerMinute: number } | null;
}

/** Seat を from から to に変えたときの差分 */
export function seatPreview(from: SeatId, to: SeatId): SeatPreview {
  const a = seats.find((s) => s.id === from);
  const b = seats.find((s) => s.id === to);
  if (!a || !b) return { capacity: 0, monthlyCost: 0 };
  return { capacity: b.dailyUsage / a.dailyUsage - 1, monthlyCost: seatMonthlyCost(b) - seatMonthlyCost(a) };
}

/** 社員と Seat の画面の表示用データ（純粋関数） */
export function teamView(state: GameState): TeamView {
  const editable = isUnlocked(state, 'team');
  const members = teamMembers(state).map((h): MemberView => {
    const seat = seatOf(state, h.id);
    const operator = operatedWorkers(h.id).length > 0;
    const used = state.team[h.id]?.used ?? 0;
    return {
      id: h.id,
      name: h.name,
      role: ja.roles[h.role],
      strengths: h.strengths.map((k) => ja.taskKinds[k]),
      operator,
      usage: operator ? { used, limit: seat.dailyUsage, over: overLimit(state, h.id) } : null,
      monthlyCost: seatMonthlyCost(seat),
      options: seats.map((s) => ({
        id: s.id,
        label: s.name,
        selected: s.id === seat.id,
        preview: s.id === seat.id ? null : seatPreview(seat.id, s.id),
        command: s.id === seat.id || !editable ? null : { type: 'SetSeat', staffId: h.id, seat: s.id },
      })),
    };
  });
  const agent = aiWorkers[0];
  const model = agent ? getModel(harnessOf(state, agent.id).modelId) : null;
  return {
    members,
    monthlyTotal: members.reduce((sum, m) => sum + m.monthlyCost, 0),
    editable,
    model: model ? { name: model.name, usagePerMinute: model.usagePerMinute } : null,
  };
}

/** AI Worker の運用者の Seat の使用量が上限を超えているか（ドックのボタンに警告を出す） */
export function usageWarning(state: GameState): boolean {
  return teamMembers(state).some((h) => operatedWorkers(h.id).length > 0 && overLimit(state, h.id));
}
