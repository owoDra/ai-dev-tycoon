import { ja } from '../../i18n/ja';
import type { ProjectDef } from '../types';

const t = ja.tasks.saasFeature;

/**
 * SaaS の新機能追加（企画書20章のボトルネックゲーム）。要件定義 → API 実装 / 画面実装（→ ヘルプ記事）/ データ移行 → QA → リリース。
 * AI に向いた実装が3つ並んで始まるので、AI に任せるほど人間2人に指示出しと確認が同時に押し寄せる
 * （Human Bottleneck が起きやすい）。実装を AI 化すると QA が、QA も AI 化すると実装のレビューが次のボトルネックになり、
 * Eval で確認を軽くすると全工程が短くなる。
 */
export const saasFeature: ProjectDef = {
  id: 'saasFeature',
  name: ja.projects.saasFeature,
  revenue: 1_800_000,
  deadlineDays: 5,
  tasks: [
    {
      id: 'spec',
      name: t.spec,
      kind: 'planning',
      deps: [],
      effort: 120,
      difficulty: 0.4,
      aiAptitude: 0.5,
      qualityReq: 0.7,
      failRisk: 0.3,
    },
    {
      id: 'api',
      name: t.api,
      kind: 'code',
      deps: ['spec'],
      effort: 480,
      difficulty: 0.4,
      aiAptitude: 0.85,
      qualityReq: 0.7,
      failRisk: 0.3,
    },
    {
      id: 'ui',
      name: t.ui,
      kind: 'code',
      deps: ['spec'],
      effort: 180,
      difficulty: 0.4,
      aiAptitude: 0.8,
      qualityReq: 0.6,
      failRisk: 0.3,
    },
    {
      id: 'migration',
      name: t.migration,
      kind: 'code',
      deps: ['spec'],
      effort: 120,
      difficulty: 0.3,
      aiAptitude: 0.85,
      qualityReq: 0.7,
      failRisk: 0.3,
    },
    {
      id: 'helpDoc',
      name: t.helpDoc,
      kind: 'content',
      deps: ['ui'],
      effort: 90,
      difficulty: 0.2,
      aiAptitude: 0.9,
      qualityReq: 0.5,
      failRisk: 0.2,
    },
    {
      id: 'qa',
      name: t.qa,
      kind: 'test',
      deps: ['api', 'ui', 'migration'],
      effort: 240,
      difficulty: 0.4,
      aiAptitude: 0.75,
      qualityReq: 0.9,
      failRisk: 0.3,
    },
    {
      id: 'release',
      name: t.release,
      kind: 'release',
      deps: ['qa', 'helpDoc'],
      effort: 60,
      difficulty: 0.3,
      aiAptitude: 0.3,
      qualityReq: 0.9,
      failRisk: 0.3,
    },
  ],
};
