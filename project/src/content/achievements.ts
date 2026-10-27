import type { AchievementDef } from './types';

/**
 * 実績。長く遊ぶ目標として、会社の成長・案件の納め方・AI の任せ方の節目を並べる（並び順が表示の順）。
 * 条件は宣言的なデータで、判定は core/achievements.ts。名前と説明は i18n の ja.achievements
 */
export const achievementDefs: readonly AchievementDef[] = [
  { id: 'firstDelivery', when: { type: 'delivered', count: 1 }, icon: 'project' },
  { id: 'startup', when: { type: 'tier', tier: 'startup' }, icon: 'trophy' },
  { id: 'small', when: { type: 'tier', tier: 'small' }, icon: 'trophy' },
  { id: 'flawlessL', when: { type: 'delivery', size: 'L', flawless: true }, icon: 'qa' },
  { id: 'delegated', when: { type: 'delegated', count: 1 }, icon: 'workflow' },
  { id: 'aiPmXl', when: { type: 'delivery', size: 'XL', manager: 'ai' }, icon: 'ai' },
  { id: 'humanPmXl', when: { type: 'delivery', size: 'XL', manager: 'human', flawless: true }, icon: 'human' },
  { id: 'mid', when: { type: 'tier', tier: 'mid' }, icon: 'trophy' },
  { id: 'delivered100', when: { type: 'delivered', count: 100 }, icon: 'release' },
  { id: 'fiscalPpd', when: { type: 'fiscal', minProfitPerPersonDay: 300_000 }, icon: 'money' },
  { id: 'fiscalGrowth', when: { type: 'fiscal', growth: 2 }, icon: 'money' },
  { id: 'autonomy', when: { type: 'autonomy', minutes: 240 }, icon: 'automation' },
  { id: 'library', when: { type: 'library', count: 5 }, icon: 'skill' },
  { id: 'reputation', when: { type: 'reputation', min: 100 }, icon: 'success' },
  { id: 'large', when: { type: 'tier', tier: 'large' }, icon: 'trophy' },
  { id: 'rank3', when: { type: 'rank', rank: 2 }, icon: 'trophy' },
  { id: 'valuation', when: { type: 'valuation', min: 1_000_000_000 }, icon: 'money' },
  { id: 'delivered500', when: { type: 'delivered', count: 500 }, icon: 'release' },
];
