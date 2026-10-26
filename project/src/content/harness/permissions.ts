import { ja } from '../../i18n/ja';
import type { HarnessPartDef } from '../types';

const n = ja.harness.parts;

const base = {
  category: 'permission',
  installCost: 0,
  runningCost: 0,
  enforcement: 'system',
  unlock: 'harness:permission',
} as const;

/**
 * Permissions（企画書17章）。強い権限ほど仕事は速くなるが、どの Task でも事故の確率（risk）が上がる。
 * Human Gate は人間の承認を挟んで事故を抑える代わりに、人間の介入が少し重くなる
 */
export const permissionParts: readonly HarnessPartDef[] = [
  {
    ...base,
    id: 'permRead',
    name: n.permRead,
    modifiers: { success: 0.02 },
    burden: {},
    appliesTo: ['planning', 'research', 'test'],
  },
  {
    ...base,
    id: 'permWrite',
    name: n.permWrite,
    modifiers: { speed: 1.2 },
    burden: { risk: 0.02 },
    appliesTo: ['design', 'content', 'code'],
  },
  {
    ...base,
    id: 'permExecute',
    name: n.permExecute,
    modifiers: { success: 0.04 },
    burden: { risk: 0.04 },
    appliesTo: ['code', 'test'],
  },
  {
    ...base,
    id: 'permDeploy',
    name: n.permDeploy,
    modifiers: { speed: 1.5, humanTime: 0.7 },
    burden: { risk: 0.12 },
    appliesTo: ['release'],
  },
  {
    ...base,
    id: 'humanGate',
    name: n.humanGate,
    modifiers: {},
    burden: { risk: -0.1, humanTime: 1.05 },
    appliesTo: [],
  },
];
