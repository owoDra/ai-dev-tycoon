import { ja } from '../../i18n/ja';
import type { HarnessModifiers, HarnessPartDef, HookTiming, TaskKind } from '../types';

const n = ja.harness.parts;

const ALL: readonly TaskKind[] = ['planning', 'research', 'design', 'content', 'code', 'test', 'release'];

interface Rule {
  readonly key: keyof typeof ja.harness.rules;
  /** Hook にしたときに動くタイミング */
  readonly timing: HookTiming;
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
    timing: 'PostToolUse',
    hook: 'hookFormatter',
    request: 'requestFormatter',
    modifiers: { success: 0.03, humanTime: 0.9, guard: 0.25 },
    appliesTo: ['code', 'content'],
    installCost: 10_000,
  },
  {
    key: 'linter',
    timing: 'PostToolUse',
    hook: 'hookLinter',
    request: 'requestLinter',
    modifiers: { success: 0.06, guard: 0.35 },
    appliesTo: ['code'],
    installCost: 10_000,
  },
  {
    key: 'unitTest',
    timing: 'PostToolUse',
    hook: 'hookUnitTest',
    request: 'requestUnitTest',
    modifiers: { success: 0.1, speed: 0.95, guard: 0.5 },
    appliesTo: ['code', 'test'],
    installCost: 20_000,
  },
  // 道具を使う前のガード。危ない操作（本番の DB を消すなど）を止めるので、どの仕事でも事故が減る
  {
    key: 'guard',
    timing: 'PreToolUse',
    hook: 'hookGuard',
    request: 'requestGuard',
    modifiers: { risk: -0.05 },
    appliesTo: ALL,
    installCost: 10_000,
  },
  // 完了前のチェック。やり残しのまま「完了」にしない
  {
    key: 'stopCheck',
    timing: 'Stop',
    hook: 'hookStopCheck',
    request: 'requestStopCheck',
    modifiers: { success: 0.03 },
    appliesTo: ALL,
    installCost: 10_000,
  },
  // 開始時の準備。依存の導入や最新の状態の取り込みを済ませてから始める
  {
    key: 'sessionStart',
    timing: 'SessionStart',
    hook: 'hookSessionStart',
    request: 'requestSessionStart',
    modifiers: { speed: 1.05, humanTime: 0.95 },
    appliesTo: ALL,
    installCost: 5_000,
  },
];

/** お願いの指示文が Context に占める分（Noise の割合） */
const REQUEST_NOISE = 0.02;

/** Hook（企画書14章）。タイミング（timing）ごとに効く失敗が変わる。お願いは無料で付けられるが確率的にしか守られず、Hook は導入コストを払えば毎回守られる */
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
    timing: r.timing,
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
    timing: r.timing,
    unlock: 'harness:hook',
  },
]);
