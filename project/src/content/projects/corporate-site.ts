import { ja } from '../../i18n/ja';
import type { ProjectTemplateDef } from '../types';

const t = ja.tasks.corporateSite;

/**
 * コーポレートサイト制作（中規模）。ヒアリング → サイトマップ → デザイン / 原稿 / CMS → フロント実装 → アクセシビリティ確認 → 公開。
 * AI 適性の高いデザイン・原稿・実装が多いが、品質要求と失敗リスクも高い。Model を上げるだけでは指示出しと確認の人間時間が減らず、
 * Skill・Hook・Eval をそろえると人間の介入が大きく減る（Harness の効果が大きく出る案件）。
 */
export const corporateSite: ProjectTemplateDef = {
  id: 'corporateSite',
  name: ja.projects.corporateSite,
  revenue: 2_400_000,
  deadlineDays: 6,
  industries: ['media', 'internal', 'ec'],
  scales: ['frontend'],
  optional: ['cms'],
  tasks: [
    {
      id: 'hearing',
      name: t.hearing,
      kind: 'planning',
      deps: [],
      effort: 90,
      difficulty: 0.3,
      aiAptitude: 0.4,
      qualityReq: 0.6,
      failRisk: 0.3,
    },
    {
      id: 'sitemap',
      name: t.sitemap,
      kind: 'planning',
      deps: ['hearing'],
      effort: 120,
      difficulty: 0.4,
      aiAptitude: 0.7,
      qualityReq: 0.7,
      failRisk: 0.4,
    },
    {
      id: 'design',
      name: t.design,
      kind: 'design',
      deps: ['sitemap'],
      effort: 240,
      difficulty: 0.5,
      aiAptitude: 0.75,
      qualityReq: 0.7,
      failRisk: 0.5,
    },
    {
      id: 'copy',
      name: t.copy,
      kind: 'content',
      deps: ['sitemap'],
      effort: 240,
      difficulty: 0.4,
      aiAptitude: 0.85,
      qualityReq: 0.7,
      failRisk: 0.5,
    },
    {
      id: 'cms',
      name: t.cms,
      kind: 'code',
      deps: ['sitemap'],
      effort: 300,
      difficulty: 0.5,
      aiAptitude: 0.85,
      qualityReq: 0.8,
      failRisk: 0.5,
    },
    {
      id: 'frontend',
      name: t.frontend,
      kind: 'code',
      deps: ['design', 'copy'],
      effort: 480,
      difficulty: 0.6,
      aiAptitude: 0.85,
      qualityReq: 0.8,
      failRisk: 0.6,
    },
    {
      id: 'a11y',
      name: t.a11y,
      kind: 'test',
      deps: ['frontend', 'cms'],
      effort: 180,
      difficulty: 0.4,
      aiAptitude: 0.8,
      qualityReq: 0.9,
      failRisk: 0.4,
    },
    {
      id: 'release',
      name: t.release,
      kind: 'release',
      deps: ['a11y'],
      effort: 60,
      difficulty: 0.3,
      aiAptitude: 0.6,
      qualityReq: 0.9,
      failRisk: 0.3,
    },
  ],
};
