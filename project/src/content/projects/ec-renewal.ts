import { ja } from '../../i18n/ja';
import type { ProjectDef } from '../types';

const t = ja.tasks.ecRenewal;

/**
 * ECサイトリニューアル（企画書4章）。
 * 顧客要望整理 → 要件定義 → UI設計 / 競合調査 → 実装 → QA → リリース。
 * 企画書の図では競合調査が行き止まりだが、成果が使われない仕事に見えないよう実装の前で合流させる
 * （並行して進める配置の工夫が生まれる）。
 * 実装は人間だと8時間かかり、AI 化すると QA やレビューが次のボトルネックになる（企画書20章）。
 */
export const ecRenewal: ProjectDef = {
  id: 'ecRenewal',
  name: ja.projects.ecRenewal,
  revenue: 1_500_000,
  deadlineDays: 5,
  tasks: [
    {
      id: 'hearing',
      name: t.hearing,
      deps: [],
      effort: 90,
      difficulty: 0.3,
      aiAptitude: 0.4,
      qualityReq: 0.6,
      failRisk: 0.3,
      contextNeeds: [],
    },
    {
      id: 'requirements',
      name: t.requirements,
      deps: ['hearing'],
      effort: 120,
      difficulty: 0.5,
      aiAptitude: 0.5,
      qualityReq: 0.8,
      failRisk: 0.4,
      contextNeeds: [],
    },
    {
      id: 'uiDesign',
      name: t.uiDesign,
      deps: ['requirements'],
      effort: 150,
      difficulty: 0.5,
      aiAptitude: 0.7,
      qualityReq: 0.6,
      failRisk: 0.4,
      contextNeeds: [],
    },
    {
      id: 'research',
      name: t.research,
      deps: ['requirements'],
      effort: 120,
      difficulty: 0.2,
      aiAptitude: 0.9,
      qualityReq: 0.3,
      failRisk: 0.2,
      contextNeeds: [],
    },
    {
      id: 'implementation',
      name: t.implementation,
      deps: ['uiDesign', 'research'],
      effort: 480,
      difficulty: 0.6,
      aiAptitude: 0.8,
      qualityReq: 0.7,
      failRisk: 0.5,
      contextNeeds: [],
    },
    {
      id: 'qa',
      name: t.qa,
      deps: ['implementation'],
      effort: 180,
      difficulty: 0.4,
      aiAptitude: 0.4,
      qualityReq: 0.9,
      failRisk: 0.3,
      contextNeeds: [],
    },
    {
      id: 'release',
      name: t.release,
      deps: ['qa'],
      effort: 60,
      difficulty: 0.3,
      aiAptitude: 0.3,
      qualityReq: 0.9,
      failRisk: 0.3,
      contextNeeds: [],
    },
  ],
};
