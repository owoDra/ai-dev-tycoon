import { ja } from '../i18n/ja';
import { staff } from './staff';
import type { WorkerDef } from './types';

/** 会社のメンバー。人間は社員（content/staff.ts）で、AI Worker は会社の Seat の使用量を消費する（core/team.ts） */
export const workers: readonly WorkerDef[] = [
  ...staff,
  { kind: 'ai', id: 'agent', name: ja.workers.agent, modelId: 'standard' },
];
