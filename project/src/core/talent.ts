import { balance } from '../content/balance';
import { talentRoles } from '../content/talent';
import type { HumanWorkerDef, TaskKind } from '../content/types';
import { ja } from '../i18n/ja';
import { hashSeed, next, pick, type RngState, weighted } from './rng';

/*
 * 人材の生成（採用市場の候補と、チュートリアルなしで始めたときの最初の社員）。
 * 定義は id から決定論的に再生成するので、state には id だけを持つ（content/index.ts の getHuman が解決する）。
 * id は `h~<seed>`（採用市場の候補）か `h~<seed>~avg`（速度と正確さが平均ちょうどで、得意分野のない何でも屋）。
 */

const PREFIX = 'h~';
const AVERAGE = 'avg';

/** 生成した人材の id か */
export const isTalentId = (id: string) => id.startsWith(PREFIX);

/** seed から人材の id を作る。average なら速度と正確さが平均ちょうどで、得意分野のない人 */
export function talentId(seed: string, average = false): string {
  return `${PREFIX}${seed}${average ? `~${AVERAGE}` : ''}`;
}

/** 文字列から、id に使う seed（32bit のハッシュ）を作る */
const shortSeed = (text: string) => String(hashSeed(text));

interface Range {
  readonly min: number;
  readonly max: number;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** 範囲の中央（三角分布の平均） */
export const mid = (range: Range) => mean([range.min, range.max]);

/** [min, max] の三角分布（2つの一様乱数の平均）。中央の値が最も多く、端は少ない */
export function triangular(rng: RngState, range: Range): [number, RngState] {
  const [a, s1] = next(rng);
  const [b, s2] = next(s1);
  return [range.min + (range.max - range.min) * mean([a, b]), s2];
}

/** 能力の値を balance.talent.statStep の刻みに丸める */
const roundStat = (v: number) => {
  const per = 1 / balance.talent.statStep;
  return Math.round(v * per) / per;
};

/**
 * 売値（円/人日）。速度・正確さが平均より高いほど、得意分野が多いほど高い（係数は balance.talent.rate）。
 * 下限を下回らない
 */
export function talentRate(skill: number, accuracy: number, strengths: number): number {
  const { talent } = balance;
  const r = talent.rate;
  const factor =
    1 +
    r.perSkill * (skill - mid(talent.skill)) +
    r.perAccuracy * (accuracy - mid(talent.accuracy)) +
    r.perStrength * strengths -
    r.strengthOffset;
  return Math.max(r.floor, Math.round((r.mean * factor) / r.roundTo) * r.roundTo);
}

/** 得意分野を候補から count 個選ぶ（重複なし、候補の並び順） */
function pickStrengths(rng: RngState, pool: readonly TaskKind[], count: number): [TaskKind[], RngState] {
  let s = rng;
  let rest = [...pool];
  const chosen: TaskKind[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const [kind, s2] = pick(s, rest);
    s = s2;
    chosen.push(kind);
    rest = rest.filter((k) => k !== kind);
  }
  return [pool.filter((k) => chosen.includes(k)), s];
}

const cache = new Map<string, HumanWorkerDef>();

/** 生成した人材の定義。同じ id なら必ず同じ定義になる。生成した人材の id でなければ undefined */
export function generateTalent(id: string): HumanWorkerDef | undefined {
  if (!isTalentId(id)) return undefined;
  const hit = cache.get(id);
  if (hit) return hit;
  const [seed = '', tier] = id.slice(PREFIX.length).split('~');
  const average = tier === AVERAGE;
  const [surname, s1] = pick(hashSeed(`talent:${seed}`), ja.talent.surnames);
  const [given, s2] = pick(s1, ja.talent.givenNames);
  const [roleDef, s3] = weighted(
    s2,
    talentRoles.map((r) => ({ item: r, weight: r.weight })),
  );
  const [count, s4] = weighted(
    s3,
    balance.talent.strengthCount.map((weight, n) => ({ item: n, weight })),
  );
  const [strengths, s5] = pickStrengths(s4, roleDef.strengths, average ? 0 : count);
  const [rawSkill, s6] = triangular(s5, balance.talent.skill);
  const [rawAccuracy] = triangular(s6, balance.talent.accuracy);
  const skill = average ? mid(balance.talent.skill) : roundStat(rawSkill);
  const accuracy = average ? mid(balance.talent.accuracy) : roundStat(rawAccuracy);
  const def: HumanWorkerDef = {
    kind: 'human',
    id,
    name: ja.talent.name(surname, given),
    role: roleDef.role,
    dailyRate: talentRate(skill, accuracy, strengths.length),
    skill,
    accuracy,
    strengths,
    seat: 'standard',
  };
  cache.set(id, def);
  return def;
}

/** 採用市場の、その営業日の候補の id（ゲームの seed と営業日から決まる。state の乱数は使わない） */
export function marketCandidates(gameSeed: string, day: number): string[] {
  return Array.from({ length: balance.hire.candidates }, (_, i) => talentId(shortSeed(`${gameSeed}:hire:${day}:${i}`)));
}

/** チュートリアルなしで始めたときの最初の社員の id（速度と正確さが平均の人を、ゲームの seed から生成する） */
export function initialTalent(gameSeed: string): string[] {
  return Array.from({ length: balance.hire.initialStaff }, (_, i) =>
    talentId(shortSeed(`${gameSeed}:staff:${i}`), true),
  );
}
