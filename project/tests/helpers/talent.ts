import { getHuman } from '../../src/content/index';
import type { HumanWorkerDef } from '../../src/content/types';
import { initialTalent, talentId } from '../../src/core/talent';

/** 条件に合う生成した人材を、seed の番号順に count 人探す（テストで得意分野などを指定したい社員に使う） */
export function findTalents(
  match: (h: HumanWorkerDef) => boolean,
  count = 2,
): [HumanWorkerDef, HumanWorkerDef, ...HumanWorkerDef[]] {
  const found: HumanWorkerDef[] = [];
  for (let i = 0; found.length < count; i++) {
    const h = getHuman(talentId(`test-${i}`));
    if (match(h)) found.push(h);
  }
  return found as [HumanWorkerDef, HumanWorkerDef, ...HumanWorkerDef[]];
}

/**
 * 速度と正確さがちょうど平均で、得意分野のない2人（core/talent.ts の平均的な人材）。
 * 工程の所要時間をそのまま数値で確かめたいテストで、創業メンバー（平均より速い）の代わりに使う
 */
export const AVERAGE_TEAM = initialTalent('average-team') as [string, string];
