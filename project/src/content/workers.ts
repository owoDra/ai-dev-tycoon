import { ja } from '../i18n/ja';
import type { WorkerDef } from './types';

/** 会社のメンバー。並び順は人間の割り当て候補の優先順 */
export const workers: readonly WorkerDef[] = [
  { kind: 'human', id: 'sato', name: ja.workers.sato, hourlyWage: 4000, skill: 1 },
  { kind: 'human', id: 'suzuki', name: ja.workers.suzuki, hourlyWage: 3500, skill: 1 },
  { kind: 'ai', id: 'agent', name: ja.workers.agent, modelId: 'standard' },
];
