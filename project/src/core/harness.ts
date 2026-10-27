import { balance } from '../content/balance';
import { content, findWorker, getAiWorker, getHarnessPart, getModel } from '../content/index';
import type { HarnessModifierKey, HarnessModifiers, HarnessPartDef, ModelDef, TaskDef } from '../content/types';
import { getSession, updateSession } from './context';
import type { GameState, HarnessRun } from './state';

/*
 * Harness（企画書7〜8章・13〜18章）。AI Worker の実力を Model × Harness で決める。
 * 装着している部品の modifier を、項目ごとの合算のしかた（balance.harness.combine）で1つの補正にまとめる。
 * 部品ごとの特別扱いはここに書かず、すべて部品のデータ（content/harness）で表す。
 */

/** 補正なし（部品を何も付けていない） */
export const NEUTRAL: HarnessModifiers = {
  success: 0,
  speed: 1,
  noise: 0,
  humanTime: 1,
  aiCost: 1,
  risk: 0,
  evalCatch: 0,
};

const KEYS = Object.keys(NEUTRAL) as HarnessModifierKey[];

/** 合算に入れる補正の1件。weight は守られる確率（お願いの見込み）、times は同じ補正を重ねる回数（組の数） */
export interface ModifierEntry {
  readonly mods: Partial<HarnessModifiers>;
  readonly weight?: number;
  readonly times?: number;
}

/** 1つの値を weight で薄め、times 回重ねた値（合算のしかたに合わせる） */
function scaled(key: HarnessModifierKey, value: number, weight: number, times: number): number {
  const op = balance.harness.combine[key].op;
  if (op === 'mul') return (1 + (value - 1) * weight) ** times;
  if (op === 'any') return 1 - (1 - value * weight) ** times;
  return value * weight * times;
}

/**
 * 補正を合算する。add は足し、mul は掛け、any は独立な確率として「どれかが起きる」確率にし、
 * 最後に項目ごとの上限・下限に収める（balance.harness.combine）
 */
export function combineModifiers(entries: readonly ModifierEntry[]): HarnessModifiers {
  const out: Record<HarnessModifierKey, number> = { ...NEUTRAL };
  for (const key of KEYS) {
    const rule = balance.harness.combine[key];
    let v = NEUTRAL[key];
    let miss = 1;
    for (const e of entries) {
      const raw = e.mods[key];
      if (raw === undefined || (e.times ?? 1) === 0) continue;
      const s = scaled(key, raw, e.weight ?? 1, e.times ?? 1);
      if (rule.op === 'add') v += s;
      else if (rule.op === 'mul') v *= s;
      else miss *= 1 - s;
    }
    if (rule.op === 'any') v = 1 - miss;
    out[key] = Math.min(rule.max, Math.max(rule.min, v));
  }
  return out;
}

/** AI Worker の Harness。設定していなければ、Worker の既定の Model で部品なし */
export function harnessOf(state: GameState, workerId: string): HarnessRun {
  return state.harnesses[workerId] ?? { modelId: getAiWorker(workerId).modelId, parts: [] };
}

export function updateHarness(state: GameState, workerId: string, fn: (h: HarnessRun) => HarnessRun): GameState {
  return { ...state, harnesses: { ...state.harnesses, [workerId]: fn(harnessOf(state, workerId)) } };
}

const isAi = (workerId: string) => findWorker(workerId)?.kind === 'ai';

/** 装着している部品。Context Router は、Session の資料の渡し方が router であることと同じ */
export function equippedParts(state: GameState, workerId: string): HarnessPartDef[] {
  if (!isAi(workerId)) return [];
  const parts = harnessOf(state, workerId).parts.map(getHarnessPart);
  const routed = getSession(state, workerId).feed.mode === 'router';
  return routed ? [...parts, ...content.harnessParts.filter((p) => p.category === 'contextRouter')] : parts;
}

export function isEquipped(state: GameState, workerId: string, partId: string): boolean {
  return equippedParts(state, workerId).some((p) => p.id === partId);
}

/** 部品の補正が task に効くか */
export const appliesTo = (part: HarnessPartDef, task: TaskDef) =>
  task.kind !== undefined && part.appliesTo.includes(task.kind);

/**
 * AI Worker が task を作業するときの補正。装着している部品から partsModifiers で合算する。
 * skipped は今回の作業で守られなかったお願いの部品。expected なら、お願いを守られる確率で薄めた見込みにする。
 */
export function harnessModifiers(
  state: GameState,
  workerId: string,
  task: TaskDef,
  options: PartsModifierOptions = {},
): HarnessModifiers {
  return partsModifiers(equippedParts(state, workerId), task, options);
}

export interface PartsModifierOptions {
  readonly skipped?: readonly string[];
  readonly expected?: boolean;
}

/**
 * 部品の組が task の作業に与える補正。部品の burden（どの Task にも）と、task に効く modifiers を、
 * 同じカテゴリの組ごとの調整コスト（balance.harness.pairs）と合わせて合算する。
 * ゲームの AI Worker（harnessModifiers）と実務モードの工程（core/practice.ts）が同じ式を使う
 */
export function partsModifiers(
  parts: readonly HarnessPartDef[],
  task: TaskDef,
  options: PartsModifierOptions = {},
): HarnessModifiers {
  if (parts.length === 0) return NEUTRAL;
  const entries: ModifierEntry[] = [];
  for (const p of parts) {
    entries.push({ mods: p.burden });
    if (!appliesTo(p, task) || options.skipped?.includes(p.id)) continue;
    const weight = options.expected && p.enforcement === 'request' ? balance.harness.requestCompliance : 1;
    entries.push({ mods: p.modifiers, weight });
  }
  for (const [category, mods] of Object.entries(balance.harness.pairs)) {
    const n = parts.filter((p) => p.category === category).length;
    let pairs = 0;
    for (let i = 1; i < n; i++) pairs += i;
    entries.push({ mods, times: pairs });
  }
  return combineModifiers(entries);
}

/** 今回の作業で守られるかを確率で決める、お願いの部品（task に効くもの） */
export function requestParts(state: GameState, workerId: string, task: TaskDef): HarnessPartDef[] {
  return equippedParts(state, workerId).filter((p) => p.enforcement === 'request' && appliesTo(p, task));
}

/** 装着している部品のランニングコストの合計（AI が1分作業するごとの円） */
export function runningCost(state: GameState, workerId: string): number {
  return partsRunningCost(equippedParts(state, workerId));
}

const partsRunningCost = (parts: readonly HarnessPartDef[]) => parts.reduce((sum, p) => sum + p.runningCost, 0);

/** Harness の Model に、速度と費用の補正とランニングコストを入れた実効の Model。使用量も AI の利用量の補正（aiCost）に比例する */
export function harnessModel(state: GameState, workerId: string, mods: HarnessModifiers): ModelDef {
  return partsModel(getModel(harnessOf(state, workerId).modelId), equippedParts(state, workerId), mods);
}

/** Model に部品の組の補正（partsModifiers の結果）とランニングコストを入れた実効の Model */
export function partsModel(model: ModelDef, parts: readonly HarnessPartDef[], mods: HarnessModifiers): ModelDef {
  const running = partsRunningCost(parts);
  if (mods === NEUTRAL && running === 0) return model;
  return {
    ...model,
    speed: model.speed * mods.speed,
    costPerMinute: model.costPerMinute * mods.aiCost + running,
    usagePerMinute: model.usagePerMinute * mods.aiCost,
  };
}

/** Harness の補正を入れた AI の作業の成功確率。成功率の補正を足し、Noise（Tool の複雑さ・お願いの指示文）の分を引く */
export function harnessSuccess(p: number, mods: HarnessModifiers): number {
  if (mods.success === 0 && mods.noise === 0) return p;
  const { min, max } = balance.success;
  return Math.min(max, Math.max(min, p + mods.success - mods.noise * balance.context.errorPerNoise));
}

/** Harness の Noise による Tool の誤選択の確率 */
export function harnessToolMiss(mods: HarnessModifiers): number {
  return Math.min(1, mods.noise * balance.context.toolMissPerNoise);
}

/** Eval の自動検証1回の時間（分） */
export function evalMinutes(task: TaskDef, model: ModelDef): number {
  return (task.effort * balance.harness.evalShare) / model.speed;
}

/** 導入コストの記録。会社の資産として持つので、一度払った部品は付け直しても払わない */
function charge(state: GameState, part: HarnessPartDef): GameState {
  if (state.ownedParts.includes(part.id)) return state;
  const ledger = part.installCost > 0 ? [{ partId: part.id, cost: part.installCost, at: state.clock }] : [];
  return { ...state, ownedParts: [...state.ownedParts, part.id], harnessLedger: [...state.harnessLedger, ...ledger] };
}

/**
 * 部品を装着する。同じ group の部品（同じ内容のお願いと Hook）は外して付け替える。
 * Context Router は Session の資料の渡し方を router にすることで装着する。付けられなければ state をそのまま返す
 */
export function equipPart(
  state: GameState,
  workerId: string,
  partId: string,
  isUnlocked: (part: HarnessPartDef) => boolean,
): GameState {
  const part = content.harnessParts.find((p) => p.id === partId);
  if (!isAi(workerId) || !part || !isUnlocked(part) || isEquipped(state, workerId, partId)) return state;
  let next = charge(state, part);
  if (part.category === 'contextRouter') {
    next = updateSession(next, workerId, (s) => ({ ...s, feed: { mode: 'router' } }));
  } else {
    next = updateHarness(next, workerId, (h) => ({ ...h, parts: withPart(h.parts, partId) }));
  }
  return next;
}

/** 部品の id の並びに部品を足す。同じ group の部品（同じ内容のお願いと Hook）は外して付け替える */
export function withPart(parts: readonly string[], partId: string): string[] {
  const group = getHarnessPart(partId).group;
  const mates = (id: string) => group !== undefined && getHarnessPart(id).group === group;
  return [...parts.filter((id) => id !== partId && !mates(id)), partId];
}

/** 部品を外す。Context Router を外すと、資料の渡し方は「必要な資料だけ」に戻る */
export function removePart(state: GameState, workerId: string, partId: string): GameState {
  if (!isEquipped(state, workerId, partId)) return state;
  const part = getHarnessPart(partId);
  return part.category === 'contextRouter'
    ? updateSession(state, workerId, (s) => ({ ...s, feed: { mode: 'needed' } }))
    : updateHarness(state, workerId, (h) => ({ ...h, parts: h.parts.filter((id) => id !== partId) }));
}

/** Model を変える */
export function setModel(state: GameState, workerId: string, modelId: string): GameState {
  if (!isAi(workerId) || !content.models.some((m) => m.id === modelId)) return state;
  if (harnessOf(state, workerId).modelId === modelId) return state;
  return updateHarness(state, workerId, (h) => ({ ...h, modelId }));
}
