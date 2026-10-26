import { ja } from '../i18n/ja';
import type { ModelDef } from './types';

/**
 * AI Model（企画書7章）。Harness Builder で AI Worker ごとに選ぶ。並び順は選択肢の順（Seat と経済は Phase 13）。
 * 最上位モデルは失敗が少ないが高く、Harness なしでは指示出しと確認の人間時間は減らない（「高いモデルを買えば勝ち」にしない）
 */
export const models: readonly ModelDef[] = [
  { id: 'lite', name: ja.models.lite, capability: 0.85, speed: 30, costPerMinute: 15 },
  { id: 'standard', name: ja.models.standard, capability: 0.95, speed: 24, costPerMinute: 40 },
  { id: 'frontier', name: ja.models.frontier, capability: 1.05, speed: 20, costPerMinute: 160 },
];
