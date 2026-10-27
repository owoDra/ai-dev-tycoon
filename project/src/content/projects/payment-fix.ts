import { ja } from '../../i18n/ja';
import type { ProjectTemplateDef } from '../types';

const t = ja.tasks.paymentFix;

/**
 * 決済画面の修正（企画書10章）。不具合の再現 → 決済仕様の確認 → 修正 → テスト追加 → リリースの一本道。
 * どの Task も AI 適性が高いが、資料が多く（content/documents.ts）、何を渡すかで AI の成否が大きく変わる。
 * 「すべての資料」は古い仕様と矛盾するルールを含み、長く続けた Session は履歴で散らかる。
 */
export const paymentFix: ProjectTemplateDef = {
  id: 'paymentFix',
  name: ja.projects.paymentFix,
  revenue: 900_000,
  deadlineDays: 3,
  industries: ['payment', 'ec', 'saas'],
  scales: ['fix'],
  optional: ['spec'],
  tasks: [
    {
      id: 'reproduce',
      kind: 'test',
      name: t.reproduce,
      deps: [],
      effort: 150,
      difficulty: 0.4,
      aiAptitude: 0.8,
      qualityReq: 0.6,
      failRisk: 0.3,
    },
    {
      id: 'spec',
      kind: 'planning',
      name: t.spec,
      deps: ['reproduce'],
      effort: 120,
      difficulty: 0.4,
      aiAptitude: 0.8,
      qualityReq: 0.8,
      failRisk: 0.3,
    },
    {
      id: 'fix',
      kind: 'code',
      name: t.fix,
      deps: ['spec'],
      effort: 360,
      difficulty: 0.5,
      aiAptitude: 0.9,
      qualityReq: 0.9,
      failRisk: 0.4,
    },
    {
      id: 'tests',
      kind: 'test',
      name: t.tests,
      deps: ['fix'],
      effort: 240,
      difficulty: 0.4,
      aiAptitude: 0.9,
      qualityReq: 0.8,
      failRisk: 0.3,
    },
    {
      id: 'release',
      kind: 'release',
      name: t.release,
      deps: ['tests'],
      effort: 90,
      difficulty: 0.3,
      aiAptitude: 0.8,
      qualityReq: 0.9,
      failRisk: 0.3,
    },
  ],
};
