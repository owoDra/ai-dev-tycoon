import { balance } from '../../src/content/balance';
import { getProject } from '../../src/content/index';
import { type Command, reduce } from '../../src/core/commands';
import { generatedProjectId } from '../../src/core/projectGen';
import { type ProjectScore, scoreProject } from '../../src/core/scoring';
import { createInitialState, type GameState, type ManagerRun } from '../../src/core/state';
import { step } from '../../src/core/step';
import { talentId } from '../../src/core/talent';

/*
 * 管理者の比較（画面なし）。管理者を置ける規模の会社で、平均的な能力の社員 WORKERS 人と AI Worker のチームを作り、
 * 案件1件をチームに割り当てて管理者に任せ、納品まで進める。人間 PM はチームの社員がもう1人増え、その人が PM になる。
 */

/** チームの作業をする社員の数 */
export const WORKERS = 3;
const DAY = balance.time.minutesPerDay;
/** 納品までの上限（営業日） */
const LIMIT_DAYS = 60;

const must = (s: GameState, c: Command) => {
  const r = reduce(s, c);
  if (r.state === s) throw new Error(`Command が通らない: ${JSON.stringify(c)}`);
  return r.state;
};

/** 管理者に任せたチームで案件を進めた state（納品か上限まで） */
export function playManaged(projectId: string, kind: ManagerRun['kind'], seed: string): GameState {
  const workers = Array.from({ length: WORKERS }, (_, i) => talentId(`${seed}:w${i}`, true));
  const pm = talentId(`${seed}:pm`, true);
  const staff = kind === 'human' ? [...workers, pm] : workers;
  let s = createInitialState(seed, { team: staff, tier: 'small' });
  s = must(s, { type: 'CreateTeam' });
  const teamId = s.teams[0]?.id ?? '';
  for (const id of [...staff, 'agent']) s = must(s, { type: 'MoveMember', workerId: id, teamId });
  s = must(s, { type: 'StartProject', projectId });
  s = must(s, { type: 'MoveProject', projectId, teamId });
  const manager: ManagerRun = kind === 'human' ? { kind, staffId: pm } : { kind };
  s = must(s, { type: 'SetManager', teamId, manager });
  for (let day = 0; day < LIMIT_DAYS && s.projects[projectId]?.completedAt === null; day++) {
    s = step(s, DAY).state;
  }
  return s;
}

export function managedScore(projectId: string, kind: ManagerRun['kind'], seed: string): ProjectScore {
  const score = scoreProject(playManaged(projectId, kind, seed), projectId);
  if (!score) throw new Error('案件が始まっていない');
  return score;
}

/** 案件の品質要求（作業量で重み付けした平均） */
export function qualityDemand(projectId: string): number {
  const tasks = getProject(projectId).tasks;
  const effort = tasks.reduce((sum, t) => sum + t.effort, 0);
  return tasks.reduce((sum, t) => sum + t.qualityReq * t.effort, 0) / effort;
}

/** 固定 seed で生成した規模 M の案件を品質要求の順に並べ、低い方と高い方から count 件ずつ */
export function qualityExtremes(count: number, pool = 60): { low: string[]; high: string[] } {
  const ids = Array.from({ length: pool }, (_, i) => generatedProjectId(`pm:${i}`, 'M'));
  const sorted = [...ids].sort((a, b) => qualityDemand(a) - qualityDemand(b));
  return { low: sorted.slice(0, count), high: sorted.slice(-count).reverse() };
}
