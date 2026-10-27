import type { StaffRole, TaskKind } from './types';

/**
 * 採用市場の人材の生成に使う表（core/talent.ts）。数値の分布と売値の係数は balance.talent、名前は i18n の ja.talent。
 */
export interface TalentRoleDef {
  readonly role: StaffRole;
  /** 生成される重み */
  readonly weight: number;
  /** 得意分野の候補（この中から 0〜2個を選ぶ） */
  readonly strengths: readonly TaskKind[];
}

export const talentRoles: readonly TalentRoleDef[] = [
  { role: 'developer', weight: 4, strengths: ['code', 'release', 'test'] },
  { role: 'designer', weight: 2, strengths: ['design', 'content'] },
  { role: 'qa', weight: 2, strengths: ['test', 'research'] },
  { role: 'pm', weight: 2, strengths: ['planning', 'research', 'content'] },
];
