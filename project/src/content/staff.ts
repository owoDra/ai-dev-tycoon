import { ja } from '../i18n/ja';
import type { HumanWorkerDef } from './types';

/**
 * 社員（企画書6章の配置表）。並び順は人間の割り当て候補の優先順と、社員の画面の並び。
 * 誰が会社にいるかはキャンペーン（content/campaign.ts）で決まり、最初は佐藤と鈴木の2人。
 * 創業メンバーの2人は何でもこなす（得意分野なし）。後から入社する専門職は得意分野の工程が速い。
 * Seat は全員 Standard で入社し、変えるのはプレイヤー（Command の SetSeat）。
 * 売値（人日単価）は経験と専門性で決まり、5人の平均が balance の想定（8万円/人日）になる
 */
export const staff: readonly HumanWorkerDef[] = [
  {
    kind: 'human',
    id: 'sato',
    name: ja.workers.sato,
    role: 'pm',
    dailyRate: 90_000,
    skill: 1,
    strengths: [],
    seat: 'standard',
  },
  {
    kind: 'human',
    id: 'suzuki',
    name: ja.workers.suzuki,
    role: 'developer',
    dailyRate: 75_000,
    skill: 1,
    strengths: [],
    seat: 'standard',
  },
  {
    kind: 'human',
    id: 'takahashi',
    name: ja.workers.takahashi,
    role: 'designer',
    dailyRate: 80_000,
    skill: 1,
    strengths: ['design', 'content'],
    seat: 'standard',
  },
  {
    kind: 'human',
    id: 'ito',
    name: ja.workers.ito,
    role: 'developer',
    dailyRate: 85_000,
    skill: 1,
    strengths: ['code', 'release'],
    seat: 'standard',
  },
  {
    kind: 'human',
    id: 'watanabe',
    name: ja.workers.watanabe,
    role: 'qa',
    dailyRate: 70_000,
    skill: 1,
    strengths: ['test', 'research'],
    seat: 'standard',
  },
];
