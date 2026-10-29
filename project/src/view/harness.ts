import type { IconName } from '../assets/icons';
import { balance } from '../content/balance';
import { harnessPresets, type MistakeStopper, mistakes } from '../content/harness/guide';
import { content, findHarnessPart, getAiWorker, getModel } from '../content/index';
import type {
  ContextFeed,
  FeatureId,
  HarnessCategory,
  HarnessModifiers,
  HarnessPartDef,
  HookTiming,
  TaskKind,
} from '../content/types';
import { type Command, reduce } from '../core/commands';
import { contextApplies, getSession } from '../core/context';
import { expectWorker, type WorkerExpectation } from '../core/expectation';
import { equippedParts, harnessOf, writtenSize } from '../core/harness';
import type { GameState } from '../core/state';
import { isUnlocked } from '../core/unlocks';
import { ja } from '../i18n/ja';

/*
 * Harness Builder（企画書35章）の表示用データ（純粋関数）。作業の流れの道（受け取る → 計画 → 道具を使う → 書き換える →
 * 確かめる → 渡す）に、地点ごとのスロット・道の上の盾（Hook）・道の下の鍵（権限モード）と時計（Routine）を置く。
 * スロットや盾を押すと、その選択肢のパネル（rows）を開く。選択肢はそれぞれ確定したときの Command を持ち、
 * Before → After の予測はその Command を適用した state の見込みで出す。
 */

export type HarnessRowId =
  | 'model'
  | 'receive'
  | 'skill'
  | 'tools'
  | 'split'
  | 'validation'
  | 'mod'
  | 'routine'
  | 'permissions'
  | `hook:${HookTiming}`;

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
  /** 持ち込みカードの部品（core/bring.ts） */
  readonly brought: boolean;
}

export interface ModifierLine {
  readonly label: string;
  readonly value: string;
}

export interface HarnessGroupView {
  /** 見出し。1つのパネルに複数のまとまりがあるとき（盾のルールごと・資料の渡し方）だけ付ける */
  readonly title: string | null;
  readonly options: readonly HarnessOptionView[];
}

/** ルールのカード1枚の置き場所。claudeMd: 毎回読む / rules: 関係する仕事のときだけ / none: 渡さない */
export type RulePlace = 'claudeMd' | 'rules' | 'none';

export interface RuleCardView {
  readonly key: string;
  readonly name: string;
  readonly size: number;
  /** 役に立つ仕事の種類の名前（全部の仕事・どれにも役立たないはまとめた1語） */
  readonly kinds: readonly string[];
  readonly place: RulePlace;
  /** ほかの置き場所へ移す Command（置き場所ごと） */
  readonly moves: readonly { readonly place: RulePlace; readonly id: string; readonly command: Command }[];
}

/** 受け取る：ルールの仕分け。CLAUDE.md の長さと目安 */
export interface RuleSortView {
  readonly cards: readonly RuleCardView[];
  readonly claudeMdSize: number;
  readonly budget: number;
}

export interface HarnessRowView {
  readonly id: HarnessRowId;
  readonly icon: IconName;
  readonly label: string;
  /** 今の設定の要約 */
  readonly summary: string;
  readonly groups: readonly HarnessGroupView[];
  /** 受け取るのパネルだけ：ルールの仕分け */
  readonly sort?: RuleSortView;
}

/** 道の地点のスロット（パネルを開くボタン） */
export interface SlotView {
  readonly row: HarnessRowId;
  readonly icon: IconName;
  /** スロットの下の小さなラベル（CLAUDE.md・Skill など） */
  readonly chip: string;
  /** 付けている部品の要約（空なら空き） */
  readonly summary: string;
  readonly count: number;
  readonly locked: boolean;
}

export type LaneItem =
  | {
      readonly kind: 'station';
      readonly id: string;
      readonly no: number;
      readonly title: string;
      readonly slots: readonly SlotView[];
    }
  | {
      readonly kind: 'shield';
      readonly row: HarnessRowId;
      readonly title: string;
      /** hook: 強制する Hook がある / request: お願いだけ / none: 何もない */
      readonly state: 'hook' | 'request' | 'none';
      readonly locked: boolean;
    };

/** 道の下の鍵（権限モード）と時計（Routine） */
export interface UnderLaneView {
  readonly row: HarnessRowId;
  readonly icon: IconName;
  readonly label: string;
  readonly summary: string;
  readonly locked: boolean;
}

export interface MistakeView {
  readonly id: string;
  readonly label: string;
  /** ok: Harness で止まる / maybe: お願いで止まるかも / human: 人間が止める / escape: 止まらない */
  readonly tone: 'ok' | 'maybe' | 'human' | 'escape';
  readonly where: string;
}

export interface PresetView {
  readonly id: string;
  readonly label: string;
  readonly aim: string;
  readonly command: Command;
}

export interface HarnessView {
  readonly workerId: string;
  readonly workerName: string;
  /** 解放済みのパネル（Harness が未解放なら空） */
  readonly rows: readonly HarnessRowView[];
  readonly lane: readonly LaneItem[];
  readonly under: readonly UnderLaneView[];
  readonly mistakes: readonly MistakeView[];
  readonly presets: readonly PresetView[];
}

const t = ja.harness;
const ALL_KINDS: readonly TaskKind[] = ['planning', 'research', 'design', 'content', 'code', 'test', 'release'];

/** パネルごとのアイコン・解放の条件・部品のカテゴリ */
const ROWS: Readonly<
  Record<
    HarnessRowId,
    { readonly icon: IconName; readonly feature: FeatureId; readonly categories: readonly HarnessCategory[] }
  >
> = {
  model: { icon: 'model', feature: 'harness', categories: [] },
  receive: { icon: 'requirements', feature: 'harness', categories: ['claudeMd', 'rules'] },
  skill: { icon: 'skill', feature: 'harness', categories: ['skill'] },
  tools: { icon: 'tool', feature: 'harness:tool', categories: ['mcp'] },
  split: { icon: 'subagent', feature: 'harness:tool', categories: ['subagent'] },
  validation: { icon: 'eval', feature: 'harness:eval', categories: ['eval'] },
  mod: { icon: 'board', feature: 'harness:tool', categories: ['mod'] },
  routine: { icon: 'night', feature: 'harness:tool', categories: ['routine'] },
  permissions: { icon: 'permission', feature: 'harness', categories: ['permission'] },
  'hook:SessionStart': { icon: 'hook', feature: 'harness', categories: ['hook'] },
  'hook:PreToolUse': { icon: 'hook', feature: 'harness', categories: ['hook'] },
  'hook:PostToolUse': { icon: 'hook', feature: 'harness', categories: ['hook'] },
  'hook:Stop': { icon: 'hook', feature: 'harness', categories: ['hook'] },
};

/** パネルの並び（rows の順） */
const ROW_ORDER: readonly HarnessRowId[] = [
  'model',
  'hook:SessionStart',
  'receive',
  'skill',
  'hook:PreToolUse',
  'tools',
  'split',
  'hook:PostToolUse',
  'validation',
  'hook:Stop',
  'mod',
  'permissions',
  'routine',
];

/** 道の並び。地点のスロットと、地点の間の盾 */
const LANE: readonly (
  | {
      readonly station: keyof typeof t.lane.stations;
      readonly slots: readonly { row: HarnessRowId; chip: keyof typeof t.lane.chips; category?: HarnessCategory }[];
    }
  | { readonly shield: HookTiming }
)[] = [
  { shield: 'SessionStart' },
  {
    station: 'receive',
    slots: [
      { row: 'receive', chip: 'claudeMd', category: 'claudeMd' },
      { row: 'receive', chip: 'rules', category: 'rules' },
    ],
  },
  { station: 'plan', slots: [{ row: 'skill', chip: 'skill' }] },
  { shield: 'PreToolUse' },
  { station: 'tools', slots: [{ row: 'tools', chip: 'tools' }] },
  { station: 'edit', slots: [{ row: 'split', chip: 'split' }] },
  { shield: 'PostToolUse' },
  { station: 'verify', slots: [{ row: 'validation', chip: 'validation' }] },
  { shield: 'Stop' },
  { station: 'deliver', slots: [{ row: 'mod', chip: 'mod' }] },
];

const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const percent = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;

/** 補正の値を読める形にする（倍率は ×、確率・割合は %） */
export function modifierLines(mods: Partial<HarnessModifiers>): ModifierLine[] {
  return (Object.entries(mods) as [keyof HarnessModifiers, number][]).map(([key, v]) => ({
    label: t.modifierNames[key],
    value:
      key === 'speed' || key === 'humanTime' || key === 'aiCost'
        ? `×${Math.round(v * 1000) / 1000}`
        : key === 'noise'
          ? sign(Math.round(v * 1000) / 1000)
          : percent(v),
  }));
}

/** Harness Builder に表示する構成。AI Worker の state から作る（harnessSource）。選択肢の Command は workerId 宛てに作る */
export interface HarnessSource {
  readonly workerId: string;
  readonly modelId: string;
  /** 装着している部品の id（Context Router を含む） */
  readonly equipped: readonly string[];
  readonly isUnlocked: (feature: FeatureId) => boolean;
  /** 導入コストを払い済みの部品か */
  readonly owned: (partId: string) => boolean;
  /** 資料の渡し方。資料のない案件・Context が未解放なら null（渡し方と Context Router の選択肢を出さない） */
  readonly feed: ContextFeed['mode'] | null;
  /** 選べる持ち込みカードの部品（core/bring.ts） */
  readonly brought: readonly HarnessPartDef[];
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
    brought: state.brought.flatMap((id) => findHarnessPart(id) ?? []),
  };
}

function partView(src: HarnessSource, part: HarnessPartDef): HarnessPartView {
  return {
    installCost: part.installCost,
    owned: src.owned(part.id),
    runningCost: part.runningCost,
    modifiers: modifierLines(part.modifiers),
    burden: modifierLines({ ...part.burden, ...part.offTarget }),
    appliesTo: part.appliesTo.map((k) => t.kinds[k]),
    brought: part.origin === 'brought',
  };
}

const isOn = (src: HarnessSource, partId: string) => src.equipped.includes(partId);

/** 部品を付け外しする選択肢 */
function toggleOption(src: HarnessSource, part: HarnessPartDef, hint: string | null = null): HarnessOptionView {
  const on = isOn(src, part.id);
  const workerId = src.workerId;
  return {
    id: part.id,
    label: part.name,
    hint,
    selected: on,
    command: { type: on ? 'RemovePart' : 'EquipPart', workerId, partId: part.id },
    part: partView(src, part),
  };
}

const partsOf = (src: HarnessSource, category: HarnessCategory) =>
  [...content.harnessParts, ...src.brought].filter((p) => p.category === category && src.isUnlocked(p.unlock));

const equippedOf = (src: HarnessSource, categories: readonly HarnessCategory[]) =>
  src.equipped
    .map(findHarnessPart)
    .filter((p): p is HarnessPartDef => p !== undefined && categories.includes(p.category));

/** 盾のパネル：そのタイミングのルールごとに「なし / お願い / Hook」 */
function shieldGroups(src: HarnessSource, timing: HookTiming): HarnessGroupView[] {
  const workerId = src.workerId;
  const hooks = partsOf(src, 'hook').filter((p) => p.timing === timing);
  const groups = [...new Set(hooks.map((p) => p.group ?? p.id))];
  return groups.map((group) => {
    const parts = hooks.filter((p) => (p.group ?? p.id) === group);
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
    const title = t.rules[group as keyof typeof t.rules] ?? parts[0]?.name ?? group;
    return { title, options: [none, ...options] };
  });
}

/** 権限モードのパネル：既定の「毎回確認」と、モード（1つだけ） */
function permissionGroups(src: HarnessSource): HarnessGroupView[] {
  const modes = partsOf(src, 'permission');
  const on = modes.find((p) => isOn(src, p.id));
  const ask: HarnessOptionView = {
    id: 'permission:default',
    label: t.lane.defaultMode,
    hint: t.lane.defaultModeHint,
    selected: on === undefined,
    command: on ? { type: 'RemovePart', workerId: src.workerId, partId: on.id } : null,
    part: null,
  };
  return [{ title: null, options: [ask, ...modes.map((p) => toggleOption(src, p))] }];
}

/** 資料の渡し方（資料のある案件で Context が解放済みのとき） */
function feedGroups(src: HarnessSource): HarnessGroupView[] {
  const feed = src.feed;
  if (feed === null) return [];
  const workerId = src.workerId;
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
  return [{ title: t.sort.feed, options }];
}

const kindNames = (kinds: readonly TaskKind[]) =>
  kinds.length === ALL_KINDS.length
    ? [t.sort.allKinds]
    : kinds.length === 0
      ? [t.sort.noKinds]
      : kinds.map((k) => t.kinds[k]);

/** 持ち込みの Rules のカード。Rules に置くか、渡さないか */
function broughtRuleCard(src: HarnessSource, r: HarnessPartDef): RuleCardView {
  const workerId = src.workerId;
  const place: RulePlace = isOn(src, r.id) ? 'rules' : 'none';
  const command: Command =
    place === 'rules' ? { type: 'RemovePart', workerId, partId: r.id } : { type: 'EquipPart', workerId, partId: r.id };
  const to: RulePlace = place === 'rules' ? 'none' : 'rules';
  return {
    key: r.id,
    name: r.name,
    size: r.size ?? 0,
    kinds: kindNames(r.appliesTo),
    place,
    moves: [{ place: to, id: `${r.id}:${to}`, command }],
  };
}

/** 受け取る：ルールのカードの仕分け。カードは CLAUDE.md と Rules の部品の組（同じ group） */
function ruleSort(src: HarnessSource): RuleSortView {
  const workerId = src.workerId;
  // 持ち込みの Rules（CLAUDE.md の組がない）は、Rules に置くか渡さないかだけを選べるカードにする
  const md = [...partsOf(src, 'claudeMd'), ...partsOf(src, 'rules').filter((r) => r.group === undefined)];
  const cards = md.map((m): RuleCardView => {
    if (m.category === 'rules') return broughtRuleCard(src, m);
    const rule = partsOf(src, 'rules').find((r) => r.group !== undefined && r.group === m.group);
    const place: RulePlace = isOn(src, m.id) ? 'claudeMd' : rule && isOn(src, rule.id) ? 'rules' : 'none';
    const current = place === 'claudeMd' ? m : place === 'rules' ? rule : undefined;
    const target = (p: RulePlace): Command | null => {
      if (p === 'claudeMd') return { type: 'EquipPart', workerId, partId: m.id };
      if (p === 'rules') return rule ? { type: 'EquipPart', workerId, partId: rule.id } : null;
      return current ? { type: 'RemovePart', workerId, partId: current.id } : null;
    };
    const moves = (['claudeMd', 'rules', 'none'] as const)
      .filter((p) => p !== place)
      .flatMap((p) => {
        const command = target(p);
        return command ? [{ place: p, id: `${m.group}:${p}`, command }] : [];
      });
    return { key: m.group ?? m.id, name: m.name, size: m.size ?? 0, kinds: kindNames(m.appliesTo), place, moves };
  });
  return {
    cards,
    claudeMdSize: writtenSize(equippedOf(src, ['claudeMd']), 'claudeMd'),
    budget: balance.harness.budgets.claudeMd,
  };
}

function summaryOf(row: HarnessRowId, src: HarnessSource): string {
  if (row === 'model') return getModel(src.modelId).name;
  if (row === 'permissions') return equippedOf(src, ['permission'])[0]?.name ?? t.lane.defaultMode;
  const parts = equippedOf(src, ROWS[row].categories);
  const timing = row.startsWith('hook:') ? row.slice(5) : null;
  const names = parts.filter((p) => timing === null || p.timing === timing).map((p) => p.name);
  return names.join(' / ') || t.none;
}

function groupsOf(row: HarnessRowId, src: HarnessSource): HarnessGroupView[] {
  const workerId = src.workerId;
  if (row === 'model') {
    const current = src.modelId;
    return [
      {
        title: null,
        options: content.models.map((m) => ({
          id: m.id,
          label: m.name,
          // Model は費用だけでなく、会社の Seat の使用量の減り方も違う（企画書7章 Model × Harness × Seat）
          hint: `${t.running(m.costPerMinute)}・${ja.team.modelUsage(m.usagePerMinute)}`,
          selected: m.id === current,
          command: m.id === current ? null : { type: 'SetModel', workerId, modelId: m.id },
          part: null,
        })),
      },
    ];
  }
  if (row === 'receive') return feedGroups(src);
  if (row === 'permissions') return permissionGroups(src);
  if (row.startsWith('hook:')) return shieldGroups(src, row.slice(5) as HookTiming);
  const parts = ROWS[row].categories.flatMap((c) => partsOf(src, c));
  return [{ title: null, options: parts.map((p) => toggleOption(src, p)) }];
}

/** ミスのカード。止めるものが付いていれば「〜で止まる」、お願いだけなら「止まるかも」、なければ人間か納品後 */
function mistakeViews(src: HarnessSource): MistakeView[] {
  const parts = equippedOf(src, [...new Set(Object.values(ROWS).flatMap((r) => r.categories))]);
  const matches = (s: MistakeStopper, p: HarnessPartDef) =>
    'part' in s
      ? p.id === s.part || (p.group !== undefined && p.group === groupOfPart(s.part))
      : p.category === s.category;
  return mistakes.map((m) => {
    // どの仕事にも役立たないルール（去年の仕様メモ）は何も止めない
    const hits = parts.filter((p) => p.appliesTo.length > 0 && m.stoppedBy.some((s) => matches(s, p)));
    const label = t.mistakes[m.id];
    const sure = hits.find((p) => p.enforcement === 'system');
    if (sure) return { id: m.id, label, tone: 'ok', where: t.stopAt(sure.name) };
    const maybe = hits.find((p) => p.enforcement === 'request');
    if (maybe) return { id: m.id, label, tone: 'maybe', where: t.stopMaybe(maybe.name) };
    if (m.escapeWith?.some((id) => isOn(src, id))) return { id: m.id, label, tone: 'escape', where: t.escaped };
    return { id: m.id, label, tone: m.fallback, where: t.fallback[m.fallback] };
  });
}

const groupOfPart = (id: string) => findHarnessPart(id)?.group;

/** Harness Builder。解放されていないパネルは出さず、道のスロットと盾は「まだ使えません」にする */
export function harnessView(state: GameState, projectId: string, workerId: string): HarnessView {
  return harnessCard(harnessSource(state, projectId, workerId), getAiWorker(workerId).name);
}

/** 構成から Harness Builder を作る */
export function harnessCard(src: HarnessSource, title: string): HarnessView {
  const unlocked = (row: HarnessRowId) => src.isUnlocked(ROWS[row].feature);
  const rows: HarnessRowView[] = ROW_ORDER.filter(unlocked).map((id) => ({
    id,
    icon: ROWS[id].icon,
    label: t.rows[id],
    summary: summaryOf(id, src),
    groups: groupsOf(id, src),
    ...(id === 'receive' ? { sort: ruleSort(src) } : {}),
  }));
  const lane: LaneItem[] = LANE.map((item, i) => {
    if ('shield' in item) {
      const row: HarnessRowId = `hook:${item.shield}`;
      const on = equippedOf(src, ['hook']).filter((p) => p.timing === item.shield);
      const state = on.some((p) => p.enforcement === 'system') ? 'hook' : on.length > 0 ? 'request' : 'none';
      return { kind: 'shield', row, title: t.lane.shields[item.shield], state, locked: !unlocked(row) };
    }
    const no = LANE.slice(0, i + 1).filter((x) => 'station' in x).length;
    const slots = item.slots.map((s): SlotView => {
      const parts = equippedOf(src, s.category ? [s.category] : ROWS[s.row].categories);
      return {
        row: s.row,
        icon: s.category === 'rules' ? 'context' : ROWS[s.row].icon,
        chip: t.lane.chips[s.chip],
        summary: parts.length === 0 ? '' : parts.length === 1 ? (parts[0]?.name ?? '') : t.lane.count(parts.length),
        count: parts.length,
        locked: !unlocked(s.row),
      };
    });
    return { kind: 'station', id: item.station, no, title: t.lane.stations[item.station], slots };
  });
  const under: UnderLaneView[] = (['permissions', 'routine'] as const).map((row) => ({
    row,
    icon: ROWS[row].icon,
    label: row === 'permissions' ? t.lane.keys : t.lane.clock,
    summary: summaryOf(row, src),
    locked: !unlocked(row),
  }));
  const presets: PresetView[] = src.isUnlocked('harness')
    ? harnessPresets.map((p) => ({
        id: p.id,
        label: t.presets[p.id].label,
        aim: t.presets[p.id].aim,
        command: { type: 'ApplyHarnessPreset', workerId: src.workerId, presetId: p.id },
      }))
    : [];
  return { workerId: src.workerId, workerName: title, rows, lane, under, mistakes: mistakeViews(src), presets };
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
