import type { IncidentDef } from './types';

/**
 * Context に関わる事件（企画書19章）。発生条件は Context の読み取り値（core/context.ts）からの宣言的な定義で、
 * 解決アクションは Session への操作（資料の渡し方・New Session・資料を外す）の列。
 * 文言（問題 → 原因 → 次の行動、企画書49章）は i18n の ja.incidents。
 */
export const incidentDefs: readonly IncidentDef[] = [
  {
    // 不要な情報が多すぎて Context が溢れる。資料を絞って新しい Session で始め直す
    id: 'contextOverflow',
    trigger: { metric: 'fill', threshold: 0.9, perUnit: 3, max: 0.8 },
    effect: { successPenalty: 0.15, aiTimeFactor: 1.5 },
    resolve: [{ type: 'SetContextFeed', feed: { mode: 'needed' } }, { type: 'NewSession' }],
    icon: 'context',
  },
  {
    // 古い仕様を参照してしまう。古い資料を外す
    id: 'staleContext',
    trigger: { metric: 'stale', threshold: 0, perUnit: 0.5, max: 0.5 },
    effect: { successPenalty: 0.2, aiTimeFactor: 1 },
    resolve: [{ type: 'DropDocs', which: 'stale' }],
    icon: 'warning',
  },
  {
    // ルール同士が衝突して AI が迷う。矛盾する古いルールを外す
    id: 'instructionConflict',
    trigger: { metric: 'conflicts', threshold: 0, perUnit: 0.5, max: 0.5 },
    effect: { successPenalty: 0.12, aiTimeFactor: 1.3 },
    resolve: [{ type: 'DropDocs', which: 'conflicting' }],
    icon: 'warning',
  },
];
