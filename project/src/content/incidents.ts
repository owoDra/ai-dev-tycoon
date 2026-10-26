import type { IncidentDef } from './types';

/**
 * 事件（企画書19章）。技術的な問題を「敵」として登場させる。発生条件は読み取り値（core/incidents.ts の IncidentReading）からの
 * 宣言的な定義で、解決アクションは Session と Harness への操作（資料の渡し方・New Session・資料を外す・部品を付ける・減らす）の列。
 * 解決アクションは原因を取り除く（Context を絞る・防ぐ部品を付ける）ので、解決した後は同じ条件では起きにくくなる。
 * 文言（問題 → 原因 → 次の行動、企画書49章）は i18n の ja.incidents。
 */
export const incidentDefs: readonly IncidentDef[] = [
  {
    // 不要な情報が多すぎて Context が溢れる。資料を絞って新しい Session で始め直す
    id: 'contextOverflow',
    moment: 'aiWork',
    trigger: { metric: 'fill', threshold: 0.9, perUnit: 3, max: 0.8 },
    effect: { successPenalty: 0.15, aiTimeFactor: 1.5, humanTimeFactor: 1 },
    resolve: [{ type: 'SetContextFeed', feed: { mode: 'needed' } }, { type: 'NewSession' }],
    unlock: 'context',
    icon: 'context',
  },
  {
    // 古い仕様を参照してしまう。古い資料を外す
    id: 'staleContext',
    moment: 'aiWork',
    trigger: { metric: 'stale', threshold: 0, perUnit: 0.5, max: 0.5 },
    effect: { successPenalty: 0.2, aiTimeFactor: 1, humanTimeFactor: 1 },
    resolve: [{ type: 'DropDocs', which: 'stale' }],
    unlock: 'context',
    icon: 'warning',
  },
  {
    // ルール同士が衝突して AI が迷う。矛盾する古いルールを外す
    id: 'instructionConflict',
    moment: 'aiWork',
    trigger: { metric: 'conflicts', threshold: 0, perUnit: 0.5, max: 0.5 },
    effect: { successPenalty: 0.12, aiTimeFactor: 1.3, humanTimeFactor: 1 },
    resolve: [{ type: 'DropDocs', which: 'conflicting' }],
    unlock: 'context',
    icon: 'warning',
  },
  {
    // 同じ失敗を何度も直そうとして空回りする（企画書19章 Retry Spiral）。
    // 毎回同じ確認を強制する Hook か、手順を固定する Skill で、失敗そのものを減らす
    id: 'retrySpiral',
    moment: 'repair',
    trigger: { metric: 'retries', threshold: 1, perUnit: 0.35, max: 0.7 },
    guard: ['hook', 'skill'],
    effect: { successPenalty: 0.1, aiTimeFactor: 1.6, humanTimeFactor: 1 },
    resolve: [
      { type: 'EquipPart', parts: ['hookUnitTest', 'hookFormatter', 'skillReport', 'skillFrontend', 'skillPrReview'] },
    ],
    unlock: 'harness:hook',
    icon: 'hook',
  },
  {
    // 人間が長く見ていないうちに、目的から逸れていく（Agent Drift）。受け入れ基準で自動的に目的と照らし合わせる
    id: 'agentDrift',
    moment: 'aiWork',
    trigger: { metric: 'streak', threshold: 40, perUnit: 0.01, max: 0.45 },
    guard: ['eval'],
    effect: { successPenalty: 0.15, aiTimeFactor: 1.2, humanTimeFactor: 1 },
    resolve: [{ type: 'EquipPart', parts: ['evalAcceptance'] }],
    unlock: 'harness:eval',
    icon: 'warning',
  },
  {
    // 誰も確かめないまま、誤った成果物が完成扱いになる（Missing Validation）。Eval を導入して AI の作業の直後に検証する
    id: 'missingValidation',
    moment: 'aiWork',
    trigger: { metric: 'unvalidated', threshold: 0, perUnit: 0.5, max: 0.5 },
    guard: ['eval'],
    effect: { successPenalty: 0.1, aiTimeFactor: 1, humanTimeFactor: 1 },
    resolve: [{ type: 'EquipPart', parts: ['evalUnitTest', 'evalAcceptance'] }],
    unlock: 'harness:eval',
    icon: 'eval',
  },
  {
    // Subagent を増やしすぎて、調整のやり取りが爆発する（Coordination Explosion）。最適な 2〜3 体まで減らす
    id: 'coordinationExplosion',
    moment: 'aiWork',
    trigger: { metric: 'subagents', threshold: 3, perUnit: 0.3, max: 0.7 },
    effect: { successPenalty: 0.08, aiTimeFactor: 1.5, humanTimeFactor: 1 },
    resolve: [{ type: 'TrimParts', category: 'subagent', keep: 2 }],
    unlock: 'harness:subagent',
    icon: 'subagent',
  },
  {
    // AI は速いが、人間の確認待ちで止まる（Human Bottleneck）。確認がたまって1件ずつの確認も重くなる。
    // Skill で指示出しと確認の手間そのものを軽くする
    id: 'humanBottleneck',
    moment: 'humanCheck',
    trigger: { metric: 'humanQueue', threshold: 0, perUnit: 0.25, max: 0.6 },
    guard: ['skill'],
    effect: { successPenalty: 0, aiTimeFactor: 1, humanTimeFactor: 1.3 },
    resolve: [{ type: 'EquipPart', parts: ['skillFrontend', 'skillReport', 'skillPrReview'] }],
    unlock: 'harness',
    icon: 'bottleneck',
  },
];
