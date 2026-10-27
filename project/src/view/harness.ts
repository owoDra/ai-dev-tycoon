import type { IconName } from '../assets/icons';
import { content, getAiWorker, getModel } from '../content/index';
import type { ContextFeed, FeatureId, HarnessCategory, HarnessModifiers, HarnessPartDef } from '../content/types';
import { type Command, reduce } from '../core/commands';
import { contextApplies, getSession } from '../core/context';
import { expectWorker, type WorkerExpectation } from '../core/expectation';
import { equippedParts, harnessOf } from '../core/harness';
import type { GameState } from '../core/state';
import { isUnlocked } from '../core/unlocks';
import { ja } from '../i18n/ja';

/*
 * Harness Builder（企画書35章）の表示用データ（純粋関数）。AI Worker のカードの行と、行を押したときの選択肢。
 * 選択肢はそれぞれ確定したときの Command を持ち、Before → After の予測はその Command を適用した state の見込みで出す。
 */

export type HarnessRowId = 'model' | 'context' | 'tools' | 'automation' | 'validation' | 'permissions' | 'split';

export interface HarnessOptionView {
  readonly id: string;
  readonly label: string;
  readonly hint: string | null;
  readonly selected: boolean;
  /** 確定したときの Command。null なら押しても変わらない（選択中の「なし」など） */
  readonly command: Command | null;
  /** 部品なら、導入コスト・ランニングコスト・補正の詳細（「詳しく見る」で出す） */
  readonly part: HarnessPartView | null;
}

export interface HarnessPartView {
  readonly installCost: number;
  /** 会社の資産として導入済み（付け直しても払わない） */
  readonly owned: boolean;
  readonly runningCost: number;
  readonly modifiers: readonly ModifierLine[];
  readonly burden: readonly ModifierLine[];
  /** 効く仕事の種類の名前（空ならすべての仕事に効く補正はない） */
  readonly appliesTo: readonly string[];
}

export interface ModifierLine {
  readonly label: string;
  readonly value: string;
}

export interface HarnessGroupView {
  /** 見出し。1つの行に複数のまとまりがあるとき（渡す情報：資料の渡し方と Skill、自動化：ルールごと）だけ付ける */
  readonly title: string | null;
  readonly options: readonly HarnessOptionView[];
}

export interface HarnessRowView {
  readonly id: HarnessRowId;
  readonly icon: IconName;
  readonly label: string;
  /** 今の設定の要約（カードの行に出す） */
  readonly summary: string;
  readonly groups: readonly HarnessGroupView[];
}

export interface HarnessView {
  readonly workerId: string;
  readonly workerName: string;
  readonly rows: readonly HarnessRowView[];
}

const t = ja.harness;

/** 行ごとのアイコン・解放の条件・部品のカテゴリ */
const ROWS: readonly {
  readonly id: HarnessRowId;
  readonly icon: IconName;
  readonly feature: FeatureId;
  readonly category: HarnessCategory | null;
}[] = [
  { id: 'model', icon: 'model', feature: 'harness', category: null },
  { id: 'context', icon: 'context', feature: 'harness', category: 'skill' },
  { id: 'tools', icon: 'tool', feature: 'harness:tool', category: 'tool' },
  { id: 'automation', icon: 'hook', feature: 'harness:hook', category: 'hook' },
  { id: 'validation', icon: 'eval', feature: 'harness:eval', category: 'eval' },
  { id: 'permissions', icon: 'permission', feature: 'harness:permission', category: 'permission' },
  { id: 'split', icon: 'subagent', feature: 'harness:subagent', category: 'subagent' },
];

const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const percent = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;

/** 補正の値を読める形にする（倍率は ×、確率・割合は %） */
function modifierLines(mods: Partial<HarnessModifiers>): ModifierLine[] {
  return (Object.entries(mods) as [keyof HarnessModifiers, number][]).map(([key, v]) => ({
    label: t.modifierNames[key],
    value:
      key === 'speed' || key === 'humanTime' || key === 'aiCost' ? `×${v}` : key === 'noise' ? sign(v) : percent(v),
  }));
}

/**
 * Harness Builder に表示する構成。ゲームでは AI Worker の state から（harnessSource）、
 * 実務モードでは工程の入力から作る（view/practice.ts）。選択肢の Command は workerId 宛てに作る
 */
export interface HarnessSource {
  readonly workerId: string;
  readonly modelId: string;
  /** 装着している部品の id（Context Router を含む） */
  readonly equipped: readonly string[];
  readonly isUnlocked: (feature: FeatureId) => boolean;
  /** 導入コストを払い済みの部品か */
  readonly owned: (partId: string) => boolean;
  /** 資料の渡し方。資料のない案件・Context が未解放・実務モードでは null（渡し方と Context Router の選択肢を出さない） */
  readonly feed: ContextFeed['mode'] | null;
}

/** AI Worker の Harness Builder の構成 */
export function harnessSource(state: GameState, projectId: string, workerId: string): HarnessSource {
  const showFeed = contextApplies(projectId) && isUnlocked(state, 'context');
  return {
    workerId,
    modelId: harnessOf(state, workerId).modelId,
    equipped: equippedParts(state, workerId).map((p) => p.id),
    isUnlocked: (f) => isUnlocked(state, f),
    owned: (id) => state.ownedParts.includes(id),
    feed: showFeed ? getSession(state, workerId).feed.mode : null,
  };
}

function partView(src: HarnessSource, part: HarnessPartDef): HarnessPartView {
  return {
    installCost: part.installCost,
    owned: src.owned(part.id),
    runningCost: part.runningCost,
    modifiers: modifierLines(part.modifiers),
    burden: modifierLines(part.burden),
    appliesTo: part.appliesTo.map((k) => t.kinds[k]),
  };
}

const isOn = (src: HarnessSource, partId: string) => src.equipped.includes(partId);

/** 部品を付け外しする選択肢 */
function toggleOption(src: HarnessSource, part: HarnessPartDef, hint: string | null = null) {
  const on = isOn(src, part.id);
  const workerId = src.workerId;
  return {
    id: part.id,
    label: part.name,
    hint,
    selected: on,
    command: { type: on ? 'RemovePart' : 'EquipPart', workerId, partId: part.id } as Command,
    part: partView(src, part),
  };
}

const partsOf = (src: HarnessSource, category: HarnessCategory) =>
  content.harnessParts.filter((p) => p.category === category && src.isUnlocked(p.unlock));

/** 自動化の行：ルールごとに「なし / お願い / Hook」 */
function ruleGroups(src: HarnessSource): HarnessGroupView[] {
  const workerId = src.workerId;
  const groups = [...new Set(partsOf(src, 'hook').map((p) => p.group ?? p.id))];
  return groups.map((group) => {
    const parts = partsOf(src, 'hook').filter((p) => (p.group ?? p.id) === group);
    const on = parts.find((p) => isOn(src, p.id));
    const none: HarnessOptionView = {
      id: `${group}:none`,
      label: t.ruleOff,
      hint: null,
      selected: on === undefined,
      command: on ? { type: 'RemovePart', workerId, partId: on.id } : null,
      part: null,
    };
    const options = parts.map((p) => ({
      ...toggleOption(src, p, p.enforcement === 'request' ? t.requestHint : t.hookHint),
      label: p.enforcement === 'request' ? t.ruleRequest : t.ruleHook,
      // 選択中のものを押しても外さない（外すのは「なし」）
      command: isOn(src, p.id) ? null : ({ type: 'EquipPart', workerId, partId: p.id } as Command),
    }));
    return { title: t.rules[group as keyof typeof t.rules] ?? group, options: [none, ...options] };
  });
}

/** 渡す情報の行：資料の渡し方（資料のある案件で Context が解放済みのとき）と Skill */
function contextGroups(src: HarnessSource): HarnessGroupView[] {
  const groups: HarnessGroupView[] = [];
  const feed = src.feed;
  const workerId = src.workerId;
  if (feed !== null) {
    const options: HarnessOptionView[] = (['needed', 'all'] as const).map((mode) => ({
      id: `feed:${mode}`,
      label: ja.context.feed[mode],
      hint: ja.context.feedHint[mode],
      selected: feed === mode,
      command: feed === mode ? null : { type: 'SetContextFeed', workerId, feed: { mode } },
      part: null,
    }));
    if (feed === 'pick') {
      options.push({ id: 'feed:pick', label: t.feedPick, hint: null, selected: true, command: null, part: null });
    }
    for (const p of partsOf(src, 'contextRouter')) options.push(toggleOption(src, p, ja.context.feedHint.router));
    groups.push({ title: t.feedGroup, options });
  }
  groups.push({ title: t.skillGroup, options: partsOf(src, 'skill').map((p) => toggleOption(src, p)) });
  return groups;
}

function summaryOf(row: HarnessRowId, src: HarnessSource): string {
  if (row === 'model') return getModel(src.modelId).name;
  const category = ROWS.find((r) => r.id === row)?.category;
  const names = src.equipped
    .map((id) => content.harnessParts.find((p) => p.id === id))
    .filter((p): p is HarnessPartDef => p?.category === category)
    .map((p) => p.name);
  if (row === 'context') {
    const feedName = src.feed !== null ? [ja.context.feed[src.feed]] : [];
    return [...feedName, ...names].join(' / ') || t.none;
  }
  return names.join(' / ') || t.none;
}

/** Harness Builder のカード。解放されていない行は出さない（必要になってから見せる） */
export function harnessView(state: GameState, projectId: string, workerId: string): HarnessView {
  return harnessCard(harnessSource(state, projectId, workerId), getAiWorker(workerId).name);
}

/** 構成から Harness Builder のカードを作る（ゲームと実務モードで共通） */
export function harnessCard(src: HarnessSource, title: string): HarnessView {
  const rows: HarnessRowView[] = [];
  const workerId = src.workerId;
  for (const row of ROWS) {
    if (!src.isUnlocked(row.feature)) continue;
    let groups: HarnessGroupView[];
    if (row.id === 'model') {
      const current = src.modelId;
      groups = [
        {
          title: null,
          options: content.models.map((m) => ({
            id: m.id,
            label: m.name,
            // Model は費用だけでなく、運用者の Seat の使用量の減り方も違う（企画書7章 Model × Harness × Seat）
            hint: `${t.running(m.costPerMinute)}・${ja.team.modelUsage(m.usagePerMinute)}`,
            selected: m.id === current,
            command: m.id === current ? null : { type: 'SetModel', workerId, modelId: m.id },
            part: null,
          })),
        },
      ];
    } else if (row.id === 'context') groups = contextGroups(src);
    else if (row.id === 'automation') groups = ruleGroups(src);
    else {
      const category = row.category as HarnessCategory;
      groups = [{ title: null, options: partsOf(src, category).map((p) => toggleOption(src, p)) }];
    }
    rows.push({ id: row.id, icon: row.icon, label: t.rows[row.id], summary: summaryOf(row.id, src), groups });
  }
  return { workerId, workerName: title, rows };
}

/** Before → After の予測（企画書48章）。今の設定と、選択肢を確定した後の、案件の AI の仕事の見込み */
export interface HarnessForecast {
  readonly before: WorkerExpectation;
  readonly after: WorkerExpectation;
}

/** 選択肢の Command を適用した state で見込みを出す（state は変えない） */
export function harnessForecast(
  state: GameState,
  projectId: string,
  workerId: string,
  command: Command | null,
): HarnessForecast {
  const before = expectWorker(state, projectId, workerId);
  if (!command) return { before, after: before };
  return { before, after: expectWorker(reduce(state, command).state, projectId, workerId) };
}
