import { assignModes } from './assignModes';
import { models } from './models';
import { ecRenewal } from './projects/ec-renewal';
import type { AiWorkerDef, AssignModeDef, HumanWorkerDef, ModelDef, ProjectDef, TaskDef, WorkerDef } from './types';
import { workers } from './workers';

/** ゲームデータ一式。新しい案件は projects に足す */
export interface Content {
  readonly projects: readonly ProjectDef[];
  readonly workers: readonly WorkerDef[];
  readonly models: readonly ModelDef[];
  readonly assignModes: readonly AssignModeDef[];
}

export const content: Content = {
  projects: [ecRenewal],
  workers,
  models,
  assignModes,
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

export function findWorker(id: string): WorkerDef | undefined {
  return content.workers.find((w) => w.id === id);
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

export const humans: readonly HumanWorkerDef[] = content.workers.filter((w) => w.kind === 'human');
