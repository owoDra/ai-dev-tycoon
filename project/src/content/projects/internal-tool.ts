import { ja } from '../../i18n/ja';
import type { ProjectTemplateDef } from '../types';

const t = ja.tasks.internalTool;

/**
 * 社内ツールの改修（短納期の小さな案件）。業務ヒアリング → 自動化スクリプト / 管理画面 → 動作テスト → 引き継ぎ。
 * AI に向いた実装が多く納期も短いので、キャンペーンLP制作と並べると AI Worker の使用量が一気に減り、
 * 会社の Seat が足りるか（Seat を買い足すか、Workflow と Context を見直すか）が問われる。
 */
export const internalTool: ProjectTemplateDef = {
  id: 'internalTool',
  name: ja.projects.internalTool,
  revenue: 1_400_000,
  deadlineDays: 1,
  industries: ['internal', 'saas'],
  scales: ['automation'],
  optional: ['dashboard'],
  tasks: [
    {
      id: 'interview',
      name: t.interview,
      kind: 'planning',
      deps: [],
      effort: 90,
      difficulty: 0.3,
      aiAptitude: 0.5,
      qualityReq: 0.6,
      failRisk: 0.3,
    },
    {
      id: 'automation',
      name: t.automation,
      kind: 'code',
      deps: ['interview'],
      effort: 360,
      difficulty: 0.4,
      aiAptitude: 0.9,
      qualityReq: 0.6,
      failRisk: 0.3,
    },
    {
      id: 'dashboard',
      name: t.dashboard,
      kind: 'design',
      deps: ['interview'],
      effort: 240,
      difficulty: 0.4,
      aiAptitude: 0.8,
      qualityReq: 0.5,
      failRisk: 0.3,
    },
    {
      id: 'test',
      name: t.test,
      kind: 'test',
      deps: ['automation', 'dashboard'],
      effort: 150,
      difficulty: 0.3,
      aiAptitude: 0.7,
      qualityReq: 0.8,
      failRisk: 0.3,
    },
    {
      id: 'handover',
      name: t.handover,
      kind: 'release',
      deps: ['test'],
      effort: 60,
      difficulty: 0.3,
      aiAptitude: 0.4,
      qualityReq: 0.8,
      failRisk: 0.3,
    },
  ],
};
