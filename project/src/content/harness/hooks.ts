import { ja } from '../../i18n/ja';
import type { HarnessModifiers, HarnessPartDef, TaskKind } from '../types';

const n = ja.harness.parts;

interface Rule {
  readonly key: 'formatter' | 'linter' | 'unitTest';
  readonly hook: string;
  readonly request: string;
  readonly modifiers: Partial<HarnessModifiers>;
  readonly appliesTo: readonly TaskKind[];
  readonly installCost: number;
}

/**
 * 同じ内容のルール。「お願い（指示文に書く）」と「Hook（強制する）」の両方を選択肢にする（企画書14章）。
 * 効き目は同じだが、お願いは作業ごとに確率でしか守られず、指示文が Context を少し占める
 */
const rules: readonly Rule[] = [
  {
    key: 'formatter',
    hook: 'hookFormatter',
    request: 'requestFormatter',
    modifiers: { success: 0.03, humanTime: 0.9 },
    appliesTo: ['code', 'content'],
    installCost: 10_000,
  },
  {
    key: 'linter',
    hook: 'hookLinter',
    request: 'requestLinter',
    modifiers: { success: 0.06 },
    appliesTo: ['code'],
    installCost: 10_000,
  },
  {
    key: 'unitTest',
    hook: 'hookUnitTest',
    request: 'requestUnitTest',
    modifiers: { success: 0.1, speed: 0.95 },
    appliesTo: ['code', 'test'],
    installCost: 20_000,
  },
];

/** お願いの指示文が Context に占める分（Noise の割合） */
const REQUEST_NOISE = 0.02;

/** Hook（企画書14章）。お願いは無料で付けられるが確率的にしか守られず、Hook は導入コストを払えば毎回守られる */
export const hookParts: readonly HarnessPartDef[] = rules.flatMap((r): HarnessPartDef[] => [
  {
    id: r.request,
    category: 'hook',
    name: n[r.request as keyof typeof n],
    installCost: 0,
    runningCost: 0,
    modifiers: r.modifiers,
    burden: { noise: REQUEST_NOISE },
    appliesTo: r.appliesTo,
    enforcement: 'request',
    group: r.key,
    unlock: 'harness:hook',
  },
  {
    id: r.hook,
    category: 'hook',
    name: n[r.hook as keyof typeof n],
    installCost: r.installCost,
    runningCost: 1,
    modifiers: r.modifiers,
    burden: {},
    appliesTo: r.appliesTo,
    enforcement: 'system',
    group: r.key,
    unlock: 'harness:hook',
  },
]);
