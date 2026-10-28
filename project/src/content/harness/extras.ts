import { ja } from '../../i18n/ja';
import type { HarnessPartDef, TaskKind } from '../types';

const n = ja.harness.parts;
const ALL: readonly TaskKind[] = ['planning', 'research', 'design', 'content', 'code', 'test', 'release'];

/**
 * Mod（Claude Code の画面を足す拡張）。AI の様子が画面の端に出るので、人間が見張る時間（humanTime）が減る。
 * 重ねるほど効くが、合算の下限（balance.harness.combine.humanTime）で頭打ちになる
 */
export const modParts: readonly HarnessPartDef[] = [
  { id: 'modStatusLine', name: n.modStatusLine, installCost: 5_000, modifiers: { humanTime: 0.95 } },
  { id: 'modSidePanel', name: n.modSidePanel, installCost: 10_000, modifiers: { humanTime: 0.93 } },
  { id: 'modToast', name: n.modToast, installCost: 5_000, modifiers: { humanTime: 0.96 } },
].map((p) => ({
  ...p,
  category: 'mod',
  runningCost: 0,
  burden: {},
  appliesTo: ALL,
  enforcement: 'system',
  unlock: 'harness:mod',
}));

/** Routine・定期実行。人間がいない夜も AI が決まった仕事を進めるので、合う仕事が速く進む。そのぶん AI の利用量が増える */
export const routineParts: readonly HarnessPartDef[] = [
  {
    id: 'routineNightTest',
    category: 'routine',
    name: n.routineNightTest,
    installCost: 10_000,
    runningCost: 2,
    modifiers: { speed: 1.15, evalCatch: 0.1 },
    burden: { aiCost: 1.03 },
    appliesTo: ['code', 'test'],
    enforcement: 'system',
    unlock: 'harness:routine',
  },
  {
    id: 'routineReport',
    category: 'routine',
    name: n.routineReport,
    installCost: 10_000,
    runningCost: 2,
    modifiers: { speed: 1.15, humanTime: 0.9 },
    burden: { aiCost: 1.03 },
    appliesTo: ['planning', 'research', 'content'],
    enforcement: 'system',
    unlock: 'harness:routine',
  },
];
