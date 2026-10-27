import { ja } from '../i18n/ja';
import type { HumanWorkerDef } from './types';

/**
 * 固定の社員。チュートリアルを一緒に始める創業メンバーの2人で、ほかの社員は採用市場で
 * seed から生成する（core/talent.ts）。創業メンバーは何でもこなし（得意分野なし）、速さと正確さが市場の平均より高いぶん売値も高い。
 * 佐藤はボブの女性のディレクター、鈴木は眼鏡の男性のエンジニア（見た目は content/look/world.ts）。
 * Seat は全員 Standard で入社し、変えるのはプレイヤー（Command の SetSeat）
 */
export const staff: readonly HumanWorkerDef[] = [
  {
    kind: 'human',
    id: 'sato',
    name: ja.workers.sato,
    role: 'pm',
    dailyRate: 110_000,
    skill: 1.15,
    accuracy: 0.99,
    strengths: [],
    seat: 'standard',
  },
  {
    kind: 'human',
    id: 'suzuki',
    name: ja.workers.suzuki,
    role: 'developer',
    dailyRate: 100_000,
    skill: 1.1,
    accuracy: 0.99,
    strengths: [],
    seat: 'standard',
  },
];

/** 創業メンバー（チュートリアルから始めたときの最初の社員）。人員はこの後、採用市場から増やす */
export const founders: readonly string[] = ['sato', 'suzuki'];
