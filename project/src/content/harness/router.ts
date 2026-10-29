import { ja } from '../../i18n/ja';
import type { HarnessPartDef } from '../types';

/**
 * Context Router（企画書10章）。Task ごとに必要な資料だけを自動で選ぶ。
 * 装着していることは、Session の資料の渡し方が router であることと同じ（core/harness.ts）。
 * 選別の効き目は Context の計算（core/context.ts）で表れ、ここでは選別にかかる AI の利用量だけを持つ
 */
export const routerParts: readonly HarnessPartDef[] = [
  {
    id: 'contextRouter',
    category: 'contextRouter',
    name: ja.harness.parts.contextRouter,
    installCost: 20_000,
    runningCost: 1,
    modifiers: {},
    burden: { aiCost: 1.03 },
    appliesTo: [],
    enforcement: 'system',
    unlock: 'harness:tool',
  },
];
