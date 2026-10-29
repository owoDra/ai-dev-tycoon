import { balance } from '../content/balance';
import { getHuman, getModel } from '../content/index';
import { seats } from '../content/seats';
import type { HumanWorkerDef, SeatId } from '../content/types';
import type { Command } from '../core/commands';
import { tierOf } from '../core/company';
import { dailyCost } from '../core/formulas';
import { harnessOf } from '../core/harness';
import type { GameState } from '../core/state';
import { mid } from '../core/talent';
import { hireBlock, overLimit, releaseBlock, seatMonthlyCost, signingFee, teamMembers, usageLimit } from '../core/team';
import { isUnlocked } from '../core/unlocks';
import { ja } from '../i18n/ja';

/** Seat の枚数を変えたときの差分（企画書47章「AI 容量 +150 / 日・費用 +¥XX,XXX / 月」） */
export interface SeatPreview {
  /** AI 容量（会社の1営業日の使用量の上限）の差 */
  readonly capacity: number;
  /** 月額の差（円） */
  readonly monthlyCost: number;
}

/** 会社の Seat の1種類。枚数と、1枚増やす・減らす操作 */
export interface SeatCountView {
  readonly id: SeatId;
  readonly label: string;
  readonly count: number;
  /** 1枚の月額（円） */
  readonly monthlyCost: number;
  /** 1枚の1営業日の使用量 */
  readonly dailyUsage: number;
  /** 1枚増やしたときの差分 */
  readonly addPreview: SeatPreview;
  /** 1枚増やす Command。変えられなければ null */
  readonly add: Command | null;
  /** 1枚減らす Command。変えられないか、0枚なら null */
  readonly remove: Command | null;
}

/** 社員と採用候補に共通の、比べるための能力と単価 */
export interface TalentView {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  /** 得意分野の名前（なければ空） */
  readonly strengths: readonly string[];
  /** 売値（見積単価、円/人日） */
  readonly dailyRate: number;
  /** 原価（給与、円/人日） */
  readonly dailyCost: number;
  /** 速度の倍率（1 が平均） */
  readonly skill: number;
  /** 正確さ（平均は balance.human.competence） */
  readonly accuracy: number;
  /** 速度・正確さが平均と比べてどうか（色だけでなく矢印とラベルでも示す） */
  readonly skillLevel: Level;
  readonly accuracyLevel: Level;
}

/** 平均と比べた高さ */
export type Level = 'high' | 'mid' | 'low';

export interface MemberView extends TalentView {
  /** 退職の Command。退職できなければ null */
  readonly release: Command | null;
  /** 退職できない理由（文言）。退職できるか、採用が解放されていなければ null */
  readonly releaseBlocked: string | null;
}

export interface CandidateView extends TalentView {
  /** 契約金（円） */
  readonly fee: number;
  /** 採用の Command。採用できなければ null */
  readonly hire: Command | null;
}

export interface TeamView {
  readonly members: readonly MemberView[];
  /** 会社の Seat（種類ごと） */
  readonly seats: readonly SeatCountView[];
  /** 会社の今日の AI の使用量と上限。over なら AI は翌営業日まで止まっている */
  readonly usage: { readonly used: number; readonly limit: number; readonly over: boolean };
  /** Seat の固定費の合計（円/月） */
  readonly monthlyTotal: number;
  /** Seat の枚数を変えられるか（解放済み） */
  readonly editable: boolean;
  /** AI Worker の Model と、1分あたりの使用量 */
  readonly model: { readonly name: string; readonly usagePerMinute: number } | null;
  /** 採用と退職ができるか（解放済み）。できなければ採用候補のタブを出さない */
  readonly hiring: boolean;
  /** 今日の採用候補 */
  readonly candidates: readonly CandidateView[];
  /** 人員と上限 */
  readonly headcount: { readonly count: number; readonly max: number };
  /** 待機中の社員の給与の1営業日あたりの合計（円）。全員の原価の合計 */
  readonly payroll: number;
}

/** 平均からこれ以上離れたら、高い・低いと表示する（速度は倍率、正確さは確率の差） */
const LEVEL_MARGIN = { skill: 0.08, accuracy: 0.015 } as const;

function level(value: number, range: { readonly min: number; readonly max: number }, margin: number): Level {
  const center = mid(range);
  if (value >= center + margin) return 'high';
  return value <= center - margin ? 'low' : 'mid';
}

/** 人の能力と単価の表示用データ */
export function talentView(h: HumanWorkerDef): TalentView {
  return {
    id: h.id,
    name: h.name,
    role: ja.roles[h.role],
    strengths: h.strengths.map((k) => ja.taskKinds[k]),
    dailyRate: h.dailyRate,
    dailyCost: dailyCost(h),
    skill: h.skill,
    accuracy: h.accuracy,
    skillLevel: level(h.skill, balance.talent.skill, LEVEL_MARGIN.skill),
    accuracyLevel: level(h.accuracy, balance.talent.accuracy, LEVEL_MARGIN.accuracy),
  };
}

/** Seat の枚数を delta 枚変えたときの差分 */
export function seatPreview(seat: SeatId, delta: number): SeatPreview {
  const s = seats.find((x) => x.id === seat);
  if (!s) return { capacity: 0, monthlyCost: 0 };
  return { capacity: s.dailyUsage * delta, monthlyCost: seatMonthlyCost(s) * delta };
}

/** 社員と Seat の画面の表示用データ（純粋関数） */
export function teamView(state: GameState): TeamView {
  const editable = isUnlocked(state, 'team');
  const hiring = isUnlocked(state, 'hire');
  const members = teamMembers(state).map((h): MemberView => {
    const blocked = releaseBlock(state, h.id);
    return {
      ...talentView(h),
      release: hiring && blocked === null ? { type: 'Release', staffId: h.id } : null,
      releaseBlocked: hiring && blocked !== null && blocked !== 'notMember' ? ja.team.releaseBlocked[blocked] : null,
    };
  });
  const candidates = state.market.candidates.map((id): CandidateView => {
    const h = getHuman(id);
    return {
      ...talentView(h),
      fee: signingFee(id),
      hire: hiring && hireBlock(state, id) === null ? { type: 'Hire', staffId: id } : null,
    };
  });
  const agent = state.agents[0];
  const model = agent ? getModel(harnessOf(state, agent).modelId) : null;
  const seatViews = seats.map((s): SeatCountView => {
    const count = state.seats[s.id];
    return {
      id: s.id,
      label: s.name,
      count,
      monthlyCost: seatMonthlyCost(s),
      dailyUsage: s.dailyUsage,
      addPreview: seatPreview(s.id, 1),
      add: editable ? { type: 'SetSeats', seat: s.id, count: count + 1 } : null,
      remove: editable && count > 0 ? { type: 'SetSeats', seat: s.id, count: count - 1 } : null,
    };
  });
  return {
    members,
    seats: seatViews,
    usage: { used: state.usage, limit: usageLimit(state), over: overLimit(state) },
    monthlyTotal: seats.reduce((sum, s) => sum + seatMonthlyCost(s) * state.seats[s.id], 0),
    editable,
    model: model ? { name: model.name, usagePerMinute: model.usagePerMinute } : null,
    hiring,
    candidates,
    headcount: { count: members.length, max: tierOf(state).maxStaff },
    payroll: members.reduce((sum, m) => sum + m.dailyCost, 0),
  };
}

/** 会社の Seat の使用量を使い切って AI が止まっているか（ドックのボタンに警告を出す） */
export function usageWarning(state: GameState): boolean {
  return overLimit(state);
}
