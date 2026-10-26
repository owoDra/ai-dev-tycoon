import { ja } from '../../i18n/ja';
import type { HarnessPartDef } from '../types';

const n = ja.harness.parts;

/**
 * Skill（企画書13章）。毎回同じ説明をする作業の手順をテンプレートにする。
 * 指示出しと確認が軽くなり（humanTime）、手順どおりに進むので失敗も減る。
 * 導入コストは高いが、一度作れば会社の資産として以降の案件でも使え、ランニングコストはかからない。
 */
export const skillParts: readonly HarnessPartDef[] = [
  {
    id: 'skillFrontend',
    category: 'skill',
    name: n.skillFrontend,
    installCost: 40_000,
    runningCost: 0,
    modifiers: { success: 0.05, humanTime: 0.6 },
    burden: {},
    appliesTo: ['code', 'design'],
    enforcement: 'system',
    unlock: 'harness',
  },
  {
    id: 'skillReport',
    category: 'skill',
    name: n.skillReport,
    installCost: 30_000,
    runningCost: 0,
    modifiers: { success: 0.04, humanTime: 0.6 },
    burden: {},
    appliesTo: ['planning', 'research', 'content'],
    enforcement: 'system',
    unlock: 'harness',
  },
  {
    id: 'skillPrReview',
    category: 'skill',
    name: n.skillPrReview,
    installCost: 30_000,
    runningCost: 0,
    modifiers: { success: 0.02, humanTime: 0.75 },
    burden: {},
    appliesTo: ['code', 'test', 'release'],
    enforcement: 'system',
    unlock: 'harness',
  },
];
