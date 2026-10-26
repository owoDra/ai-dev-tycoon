import { ja } from '../../i18n/ja';
import type { ProjectDef } from '../types';

const t = ja.tasks.tutorialLp;

/**
 * チュートリアル案件「小さなLP制作」（企画書50〜51章）。構成案 → ページ実装 → 問い合わせフォーム → スマホ対応の一本道。
 * 構成案は AI 適性が高く、人間だと約3.7時間・AI に任せると人間の時間がほぼ消える（「-3.5 人間時間」の演出）。
 * 後半の Task は人間だと時間がかかるので、AI とレビュー・自動テストを使うほど Profit / Human Hour が伸びる。
 * AI の成否は content/tutorial.ts のシナリオで決める。
 */
export const tutorialLp: ProjectDef = {
  id: 'tutorialLp',
  name: ja.projects.tutorialLp,
  revenue: 600_000,
  deadlineDays: 2,
  tasks: [
    {
      id: 'wireframe',
      kind: 'design',
      name: t.wireframe,
      deps: [],
      effort: 220,
      difficulty: 0.2,
      aiAptitude: 0.9,
      qualityReq: 0.4,
      failRisk: 0.2,
    },
    {
      id: 'coding',
      kind: 'code',
      name: t.coding,
      deps: ['wireframe'],
      effort: 120,
      difficulty: 0.5,
      aiAptitude: 0.8,
      qualityReq: 0.5,
      failRisk: 0.4,
    },
    {
      id: 'form',
      kind: 'code',
      name: t.form,
      deps: ['coding'],
      effort: 180,
      difficulty: 0.5,
      aiAptitude: 0.8,
      qualityReq: 0.7,
      failRisk: 0.4,
    },
    {
      id: 'responsive',
      kind: 'code',
      name: t.responsive,
      deps: ['form'],
      effort: 240,
      difficulty: 0.4,
      aiAptitude: 0.8,
      qualityReq: 0.6,
      failRisk: 0.4,
    },
  ],
};
