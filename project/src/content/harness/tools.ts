import { ja } from '../../i18n/ja';
import type { HarnessPartDef } from '../types';

const n = ja.harness.parts;

/** Tool の共通の値。どれも持たせるだけで Tool の複雑さ（noise）とセキュリティ面のリスク（risk）が増える */
const base = {
  category: 'tool',
  installCost: 5_000,
  runningCost: 2,
  enforcement: 'system',
  unlock: 'harness:tool',
} as const;

/**
 * Tools / MCP（企画書16章）。合う種類の Task では成功率と速度が上がるが、持たせた数だけ負担が増え、
 * 組み合わせが増えるほど複雑になる（balance.harness.pairs.tool）。必要な Agent に必要な Tool だけ渡す
 */
export const toolParts: readonly HarnessPartDef[] = [
  {
    ...base,
    id: 'toolFiles',
    name: n.toolFiles,
    modifiers: { success: 0.03, speed: 1.15 },
    burden: { noise: 0.02, risk: 0.01 },
    appliesTo: ['code', 'content', 'design'],
  },
  {
    ...base,
    id: 'toolGit',
    name: n.toolGit,
    modifiers: { success: 0.03, speed: 1.1 },
    burden: { noise: 0.02, risk: 0.015 },
    appliesTo: ['code', 'release'],
  },
  {
    ...base,
    id: 'toolBrowser',
    name: n.toolBrowser,
    modifiers: { success: 0.04, speed: 1.1 },
    burden: { noise: 0.03, risk: 0.02 },
    appliesTo: ['research', 'design', 'test'],
  },
  {
    ...base,
    id: 'toolDatabase',
    name: n.toolDatabase,
    modifiers: { success: 0.02 },
    burden: { noise: 0.03, risk: 0.05 },
    appliesTo: ['code'],
  },
  {
    ...base,
    id: 'toolAnalytics',
    name: n.toolAnalytics,
    modifiers: { success: 0.04 },
    burden: { noise: 0.03, risk: 0.02 },
    appliesTo: ['research', 'planning'],
  },
  {
    ...base,
    id: 'toolCommunication',
    name: n.toolCommunication,
    modifiers: { success: 0.03, humanTime: 0.9 },
    burden: { noise: 0.03, risk: 0.04 },
    appliesTo: ['planning'],
  },
];
