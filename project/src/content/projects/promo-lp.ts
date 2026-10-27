import { ja } from '../../i18n/ja';
import type { ProjectTemplateDef } from '../types';

const t = ja.tasks.promoLp;

/**
 * キャンペーンLP制作（短納期の小さな案件）。企画 → コピー / ビジュアル → ページ実装 → 公開前チェック。
 * 小さな案件だが公開前チェックの品質要求が高く、同時に進む社内ツールと人間の確認を取り合う。
 */
export const promoLp: ProjectTemplateDef = {
  id: 'promoLp',
  name: ja.projects.promoLp,
  revenue: 1_000_000,
  deadlineDays: 1,
  industries: ['ec', 'media', 'saas'],
  scales: ['build'],
  optional: ['visual'],
  tasks: [
    {
      id: 'brief',
      name: t.brief,
      kind: 'planning',
      deps: [],
      effort: 60,
      difficulty: 0.3,
      aiAptitude: 0.5,
      qualityReq: 0.6,
      failRisk: 0.3,
    },
    {
      id: 'copy',
      name: t.copy,
      kind: 'content',
      deps: ['brief'],
      effort: 150,
      difficulty: 0.3,
      aiAptitude: 0.9,
      qualityReq: 0.5,
      failRisk: 0.2,
    },
    {
      id: 'visual',
      name: t.visual,
      kind: 'design',
      deps: ['brief'],
      effort: 180,
      difficulty: 0.4,
      aiAptitude: 0.7,
      qualityReq: 0.6,
      failRisk: 0.3,
    },
    {
      id: 'build',
      name: t.build,
      kind: 'code',
      deps: ['copy', 'visual'],
      effort: 240,
      difficulty: 0.4,
      aiAptitude: 0.9,
      qualityReq: 0.6,
      failRisk: 0.3,
    },
    {
      id: 'check',
      name: t.check,
      kind: 'test',
      deps: ['build'],
      effort: 60,
      difficulty: 0.3,
      aiAptitude: 0.6,
      qualityReq: 0.9,
      failRisk: 0.3,
    },
  ],
};
