import type { CampaignDef } from './types';

/**
 * キャンペーン（企画書21章「1プレイ20〜30分」「案件が進むにつれて複数案件を同時処理する」）。
 * チュートリアル → ECサイト → 決済修正 → コーポレートサイト → SaaS機能 → 複数同時進行、の順に受注できるようになる。
 * 案件が大きくなるにつれて社員が加わり、コーポレートサイトの途中から SaaS 機能が重なり始め、
 * 最後は短納期の2件を同時に進める。人と AI Worker（と運用者の Seat の使用量）は案件をまたいで共有する。
 * 機能の解放（content/unlocks.ts）と、作った Harness 部品・Workflow は案件をまたいで持ち越す
 */
export const campaign: CampaignDef = {
  team: ['sato', 'suzuki'],
  stages: [
    { id: 'tutorial', projects: ['tutorialLp'], when: { type: 'start' }, joins: [] },
    {
      id: 'ec',
      projects: ['ecRenewal'],
      when: { type: 'projectCompleted', projectId: 'tutorialLp' },
      joins: ['takahashi'],
    },
    {
      id: 'payment',
      projects: ['paymentFix'],
      when: { type: 'projectCompleted', projectId: 'ecRenewal' },
      joins: [],
    },
    {
      id: 'corporate',
      projects: ['corporateSite'],
      when: { type: 'projectCompleted', projectId: 'paymentFix' },
      joins: ['ito'],
    },
    // コーポレートサイトのサイトマップができたら、SaaS 機能の依頼が来る（初めての同時進行）
    {
      id: 'saas',
      projects: ['saasFeature'],
      when: { type: 'taskCompleted', projectId: 'corporateSite', taskId: 'sitemap' },
      joins: ['watanabe'],
    },
    {
      id: 'rush',
      projects: ['internalTool', 'promoLp'],
      when: { type: 'projectsCompleted', count: 5 },
      joins: [],
    },
  ],
};

/** キャンペーンの全案件（受注できるようになる順） */
export const campaignProjects: readonly string[] = campaign.stages.flatMap((s) => s.projects);
