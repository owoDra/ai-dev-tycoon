import { ja } from '../../i18n/ja';
import { balance } from '../balance';
import type { HarnessModifiers, HarnessPartDef, TaskKind } from '../types';

const n = ja.harness.parts;
const ALL: readonly TaskKind[] = ['planning', 'research', 'design', 'content', 'code', 'test', 'release'];

/** ルールのカード。CLAUDE.md に書くか、Rules（.claude/rules）に分けるか、渡さないかを仕分ける */
interface RuleCard {
  readonly key: string;
  /** 書いた量。CLAUDE.md の合計は balance.harness.budgets.claudeMd が目安 */
  readonly size: number;
  /** 役に立つ仕事の種類 */
  readonly kinds: readonly TaskKind[];
  /** 読んだときの補正。指示の時間が減り（humanTime）、そのルールで防げるミスを防ぐ（success） */
  readonly modifiers: Partial<HarnessModifiers>;
}

/**
 * 全部の仕事に必要な「案件の概要とコマンド」は CLAUDE.md が正解（Rules では読む前に判断してしまう）。
 * 仕事の種類が限られるルールは Rules に分けると、関係のない仕事で Noise にならない。
 * 「去年の仕様メモ」はどの仕事にも役立たず、CLAUDE.md に書けば Noise になるだけ（渡さないのが正解）
 */
const cards: readonly RuleCard[] = [
  { key: 'overview', size: 3, kinds: ALL, modifiers: { success: 0.02, humanTime: 0.85, guard: 0.1 } },
  { key: 'coding', size: 6, kinds: ['code', 'test'], modifiers: { success: 0.05, humanTime: 0.95, guard: 0.3 } },
  { key: 'design', size: 5, kinds: ['design', 'content'], modifiers: { success: 0.05, humanTime: 0.95, guard: 0.3 } },
  { key: 'testing', size: 4, kinds: ['test'], modifiers: { success: 0.05, guard: 0.3 } },
  { key: 'release', size: 4, kinds: ['release'], modifiers: { success: 0.06, humanTime: 0.9, guard: 0.3 } },
  {
    key: 'learnings',
    size: 4,
    kinds: ['planning', 'research'],
    modifiers: { success: 0.04, humanTime: 0.9, guard: 0.2 },
  },
  { key: 'oldSpec', size: 6, kinds: [], modifiers: {} },
];

const cap = (key: string) => `${key[0]?.toUpperCase()}${key.slice(1)}`;

/** Rules の補正は balance.harness.rulesRecall の割合だけ効く（読む前に判断してしまう分） */
function recalled(mods: Partial<HarnessModifiers>): Partial<HarnessModifiers> {
  const r = balance.harness.rulesRecall;
  return Object.fromEntries(
    Object.entries(mods).map(([k, v]) => [k, k === 'humanTime' ? 1 + (v - 1) * r : v * r]),
  ) as Partial<HarnessModifiers>;
}

/**
 * CLAUDE.md・メモリ（毎回読む）と Rules（関係するファイルを触るときだけ読む）。同じカードの2つは同じ group で、どちらか1つだけ置ける。
 * どちらにも置かないカードは「渡さない」で、そのルールで防げるミスを防げない。判定は Context の Noise（balance.context.errorPerNoise）に乗る
 */
export const memoryParts: readonly HarnessPartDef[] = cards.flatMap((c): HarnessPartDef[] => [
  {
    id: `md${cap(c.key)}`,
    category: 'claudeMd',
    name: n[`md${cap(c.key)}` as keyof typeof n],
    installCost: 0,
    runningCost: 0,
    modifiers: c.modifiers,
    burden: {},
    offTarget: { noise: c.size * balance.harness.claudeMdNoisePerSize },
    size: c.size,
    appliesTo: c.kinds,
    enforcement: 'system',
    group: `memory:${c.key}`,
    unlock: 'harness',
  },
  {
    id: `rule${cap(c.key)}`,
    category: 'rules',
    name: n[`rule${cap(c.key)}` as keyof typeof n],
    installCost: 0,
    runningCost: 0,
    modifiers: recalled(c.modifiers),
    burden: {},
    size: c.size,
    appliesTo: c.kinds,
    enforcement: 'system',
    group: `memory:${c.key}`,
    unlock: 'harness',
  },
]);
