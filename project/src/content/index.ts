import { generateTalent } from '../core/talent';
import { assignModes } from './assignModes';
import { documents } from './documents';
import { harnessParts } from './harness/index';
import { incidentDefs } from './incidents';
import { models } from './models';
import { corporateSite } from './projects/corporate-site';
import { ecRenewal } from './projects/ec-renewal';
import { internalTool } from './projects/internal-tool';
import { paymentFix } from './projects/payment-fix';
import { promoLp } from './projects/promo-lp';
import { saasFeature } from './projects/saas-feature';
import { tutorialLp } from './projects/tutorial-lp';
import { seats } from './seats';
import type {
  AiWorkerDef,
  AssignModeDef,
  DocumentDef,
  HarnessPartDef,
  HumanWorkerDef,
  IncidentDef,
  ModelDef,
  ProjectDef,
  SeatDef,
  TaskDef,
  WorkerDef,
} from './types';
import { workers } from './workers';

/** ゲームデータ一式。新しい案件は projects に足す（先頭はタイトル画面の後ろに映す案件） */
export interface Content {
  readonly projects: readonly ProjectDef[];
  readonly workers: readonly WorkerDef[];
  readonly models: readonly ModelDef[];
  readonly assignModes: readonly AssignModeDef[];
  readonly documents: readonly DocumentDef[];
  readonly incidents: readonly IncidentDef[];
  readonly harnessParts: readonly HarnessPartDef[];
  readonly seats: readonly SeatDef[];
}

export const content: Content = {
  projects: [ecRenewal, paymentFix, corporateSite, saasFeature, internalTool, promoLp, tutorialLp],
  workers,
  models,
  assignModes,
  documents,
  incidents: incidentDefs,
  harnessParts,
  seats,
};

export function getProject(id: string): ProjectDef {
  const p = content.projects.find((x) => x.id === id);
  if (!p) throw new Error(`未定義の案件: ${id}`);
  return p;
}

export function getTask(projectId: string, taskId: string): TaskDef {
  const t = getProject(projectId).tasks.find((x) => x.id === taskId);
  if (!t) throw new Error(`未定義の Task: ${projectId}/${taskId}`);
  return t;
}

/** Worker の定義。採用市場で生成した人材（core/talent.ts の `h~` で始まる id）も、id から再生成して返す */
export function findWorker(id: string): WorkerDef | undefined {
  return content.workers.find((w) => w.id === id) ?? generateTalent(id);
}

export function getHuman(id: string): HumanWorkerDef {
  const w = findWorker(id);
  if (w?.kind !== 'human') throw new Error(`人間の Worker ではない: ${id}`);
  return w;
}

export function getAiWorker(id: string): AiWorkerDef {
  const w = findWorker(id);
  if (w?.kind !== 'ai') throw new Error(`AI Worker ではない: ${id}`);
  return w;
}

export function getModel(id: string): ModelDef {
  const m = content.models.find((x) => x.id === id);
  if (!m) throw new Error(`未定義の Model: ${id}`);
  return m;
}

export function getHarnessPart(id: string): HarnessPartDef {
  const p = content.harnessParts.find((x) => x.id === id);
  if (!p) throw new Error(`未定義の Harness 部品: ${id}`);
  return p;
}

/** 固定の社員（content/staff.ts）。会社にいる社員は core/team.ts の teamMembers */
export const humans: readonly HumanWorkerDef[] = content.workers.filter((w) => w.kind === 'human');

export const aiWorkers: readonly AiWorkerDef[] = content.workers.filter((w) => w.kind === 'ai');
