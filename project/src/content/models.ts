import { ja } from '../i18n/ja';
import type { ModelDef } from './types';

/** AI Model（Phase 13 で種類と経済を拡張する） */
export const models: readonly ModelDef[] = [
  { id: 'standard', name: ja.models.standard, capability: 0.95, speed: 24, costPerMinute: 40 },
];
