import { ja } from '../../i18n/ja';
import type { HarnessPartDef } from '../types';

const n = ja.harness.parts;

const base = { category: 'eval', runningCost: 1, enforcement: 'system', unlock: 'harness:eval', burden: {} } as const;

/**
 * Eval（企画書18章）。AI の作業の直後に自動で検証し（Generate → Eval）、失敗を見つけたら AI が直して
 * もう一度検証する（FAIL → Repair → Eval）。人間より先に失敗を見つけるので、人間の手戻りと介入が減る。
 * 検証の時間と費用は AI が負担する（balance.harness.evalShare）
 */
export const evalParts: readonly HarnessPartDef[] = [
  {
    ...base,
    id: 'evalUnitTest',
    name: n.evalUnitTest,
    installCost: 15_000,
    modifiers: { evalCatch: 0.5 },
    appliesTo: ['code', 'test'],
  },
  {
    ...base,
    id: 'evalAcceptance',
    name: n.evalAcceptance,
    installCost: 20_000,
    modifiers: { evalCatch: 0.35, humanTime: 0.85 },
    appliesTo: ['planning', 'research', 'design', 'content', 'code', 'test', 'release'],
  },
  {
    ...base,
    id: 'evalA11y',
    name: n.evalA11y,
    installCost: 15_000,
    modifiers: { evalCatch: 0.3 },
    appliesTo: ['design', 'content', 'code'],
  },
  {
    ...base,
    id: 'evalSecurity',
    name: n.evalSecurity,
    installCost: 20_000,
    modifiers: { evalCatch: 0.3 },
    burden: { risk: -0.03 },
    appliesTo: ['code', 'release'],
  },
  {
    ...base,
    id: 'evalCodingRules',
    name: n.evalCodingRules,
    installCost: 10_000,
    modifiers: { evalCatch: 0.25, humanTime: 0.85 },
    appliesTo: ['code'],
  },
  {
    ...base,
    id: 'evalUiReq',
    name: n.evalUiReq,
    installCost: 15_000,
    modifiers: { evalCatch: 0.3 },
    appliesTo: ['design', 'code'],
  },
];
