import { ja } from '../../i18n/ja';
import type { HarnessPartDef, TaskKind } from '../types';

const n = ja.harness.parts;
const ALL: readonly TaskKind[] = ['planning', 'research', 'design', 'content', 'code', 'test', 'release'];

const base = {
  category: 'permission',
  installCost: 0,
  runningCost: 0,
  enforcement: 'system',
  group: 'permissionMode',
  unlock: 'harness:permission',
} as const;

/**
 * 権限モード（企画書17章）。何も付けないのが「毎回確認」（人間が承認のたびに呼ばれるが、事故は人間が止める）。
 * モードは1つだけ選べる。中断が減るほど速くなるが、どの Task でも事故の確率（risk）が上がる。
 * sandbox は隔離して動かすので、導入に手間（コスト）がかかる代わりに危ない操作が外へ届きにくい
 */
export const permissionParts: readonly HarnessPartDef[] = [
  {
    ...base,
    id: 'permAcceptEdits',
    name: n.permAcceptEdits,
    modifiers: { speed: 1.2 },
    burden: { risk: 0.02 },
    appliesTo: ['design', 'content', 'code'],
  },
  {
    ...base,
    id: 'permAuto',
    name: n.permAuto,
    modifiers: { speed: 1.3, humanTime: 0.8 },
    burden: { risk: 0.06 },
    appliesTo: ALL,
  },
  {
    ...base,
    id: 'permSandbox',
    name: n.permSandbox,
    installCost: 20_000,
    runningCost: 1,
    modifiers: { speed: 1.2, humanTime: 0.85 },
    burden: { risk: 0.005 },
    appliesTo: ALL,
  },
];
