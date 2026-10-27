import type { SfxId } from './sfx';

/**
 * 演出の Tier テーブル（企画書42〜45章）。報酬の大きさに段階を付け、全部が派手になって価値が下がるのを防ぐ。
 * GameEvent（と UI の選択）を view/fx.ts が FxSignal に変換し、fx/director.ts がこの表を引いて演出を起動する。
 * 新しい演出はここにデータを足すだけで増やせる。大きさ・長さ・パーティクル数は content/look/feel.ts の Tier ごとの値で決まる。
 */

/** 0: 触った反応 / 1: 普段の完了 / 2: 守られた・気付いた / 3: 大きな改善 / 4: 節目 */
export type FxTier = 0 | 1 | 2 | 3 | 4;
export const fxTierList = [0, 1, 2, 3, 4] as const satisfies readonly FxTier[];

/** 演出のきっかけ。view/fx.ts が GameEvent と ViewModel から作る */
export type FxSignalKind =
  | 'select'
  | 'taskDone'
  | 'taskDefect'
  | 'reviewCatch'
  | 'bottleneckCleared'
  | 'automation'
  | 'incident'
  | 'incidentResolved'
  | 'autoRepair'
  | 'autonomyStreak'
  | 'projectComplete'
  | 'companyPromoted'
  | 'unlock'
  | 'workflowSaved';

/**
 * 演出の部品。world（3D）と ui/fx（DOM）がそれぞれ担当する部品を再生する。
 * 大きく動く部品（KINETIC_PARTS）は reduced-motion では使わない。
 */
export type FxPart =
  // 3D
  | 'islandLift'
  | 'islandBounce'
  | 'actorHop'
  | 'actorExpression'
  | 'coinBurst'
  | 'confetti'
  | 'sparkle'
  | 'ring'
  | 'shield'
  | 'packetRush'
  | 'rays'
  | 'cameraShake'
  | 'hitStop'
  /** Agent たちが跳び上がってハイタッチする（AUTONOMY STREAK） */
  | 'highFive'
  /** 床の輪を拡大せずにふっと出して消す（reduced-motion の代替） */
  | 'glow'
  // DOM
  | 'popLabel'
  | 'comboLabel'
  | 'bigNumber'
  | 'bigType'
  | 'flash'
  /** 動かさずにフェードで出す文字（reduced-motion の代替） */
  | 'fadeLabel'
  | 'fadeBigNumber'
  | 'fadeBigType';

/** 拡大縮小・揺れ・紙吹雪・フラッシュ・大きな移動を伴う部品（企画書45章で reduced-motion 時に削るもの） */
export const KINETIC_PARTS: ReadonlySet<FxPart> = new Set<FxPart>([
  'islandLift',
  'islandBounce',
  'actorHop',
  'coinBurst',
  'confetti',
  'sparkle',
  'ring',
  'shield',
  'packetRush',
  'rays',
  'cameraShake',
  'hitStop',
  'highFive',
  'popLabel',
  'comboLabel',
  'bigNumber',
  'bigType',
  'flash',
]);

/** 文字の色合い。色だけでなくアイコンでも示す */
export type FxTone = 'success' | 'danger' | 'info' | 'accent';

export type FxId =
  | 'islandSelect'
  | 'taskDone'
  | 'taskDefect'
  | 'reviewCatch'
  | 'bottleneckCleared'
  | 'automation'
  | 'incident'
  | 'incidentResolved'
  | 'autoRepair'
  | 'autonomyStreak'
  | 'projectComplete'
  | 'companyPromoted'
  | 'featureUnlocked'
  | 'workflowSaved';

export interface FxDef {
  readonly id: FxId;
  readonly tier: FxTier;
  readonly signal: FxSignalKind;
  /** 通常の演出 */
  readonly parts: readonly FxPart[];
  /** reduced-motion のときの代替（フェードと即時切り替えだけ） */
  readonly reducedAlternative: readonly FxPart[];
  /** 文字の文言キー（i18n の ja.fx.labels）と色合い。文字を出さない演出は null */
  readonly label: { readonly key: FxId; readonly tone: FxTone } | null;
  /**
   * 一緒に鳴らす効果音（content/sfx.ts）。演出と音をここで一緒に調整する。
   * 音は補助で、どの演出も parts と reducedAlternative で画面上に必ず何かを出す（ミュートしても情報は失われない）
   */
  readonly sfx: readonly SfxId[];
  /** キャラクターの表情を変える演出の表情（actorExpression） */
  readonly expression?: 'joy' | 'focus' | 'trouble';
  /** 大きな数字（bigNumber）の書き方（i18n の ja.fx の関数）。既定は savedHours（減った人間時間） */
  readonly amount?: 'savedHours' | 'streakMinutes';
}

export const fxTable: readonly FxDef[] = [
  {
    id: 'islandSelect',
    tier: 0,
    signal: 'select',
    parts: ['islandLift'],
    reducedAlternative: ['glow'],
    label: null,
    sfx: ['select'],
  },
  {
    id: 'taskDone',
    tier: 1,
    signal: 'taskDone',
    parts: ['islandBounce', 'coinBurst', 'popLabel', 'comboLabel'],
    reducedAlternative: ['glow', 'fadeLabel'],
    label: { key: 'taskDone', tone: 'success' },
    sfx: ['taskDone', 'coin', 'combo'],
  },
  {
    id: 'taskDefect',
    tier: 1,
    signal: 'taskDefect',
    parts: ['islandBounce', 'popLabel'],
    reducedAlternative: ['fadeLabel'],
    label: { key: 'taskDefect', tone: 'danger' },
    sfx: ['failure'],
  },
  {
    id: 'reviewCatch',
    tier: 2,
    signal: 'reviewCatch',
    parts: ['shield', 'actorHop', 'actorExpression', 'sparkle', 'popLabel'],
    reducedAlternative: ['glow', 'actorExpression', 'fadeLabel'],
    label: { key: 'reviewCatch', tone: 'info' },
    sfx: ['reviewCatch'],
    expression: 'focus',
  },
  {
    id: 'bottleneckCleared',
    tier: 3,
    signal: 'bottleneckCleared',
    parts: ['packetRush', 'confetti', 'ring', 'islandBounce', 'bigType'],
    reducedAlternative: ['glow', 'fadeBigType'],
    label: { key: 'bottleneckCleared', tone: 'accent' },
    sfx: ['bottleneckCleared'],
  },
  {
    id: 'automation',
    tier: 3,
    signal: 'automation',
    parts: ['packetRush', 'confetti', 'sparkle', 'ring', 'bigType', 'bigNumber'],
    reducedAlternative: ['glow', 'fadeBigType', 'fadeBigNumber'],
    label: { key: 'automation', tone: 'accent' },
    sfx: ['automation'],
  },
  // 事件は発生（IncidentStarted と Harness の事故）と解決（IncidentResolved。島のバグ生物が弾けて消える）で起動する。
  // 自動修復は簡易 Eval（自動テスト）の EvalCaught から起動する
  {
    id: 'incident',
    tier: 2,
    signal: 'incident',
    parts: ['islandBounce', 'actorHop', 'actorExpression', 'popLabel'],
    reducedAlternative: ['glow', 'actorExpression', 'fadeLabel'],
    label: { key: 'incident', tone: 'danger' },
    sfx: ['warning'],
    expression: 'trouble',
  },
  {
    id: 'incidentResolved',
    tier: 2,
    signal: 'incidentResolved',
    parts: ['sparkle', 'ring', 'islandBounce', 'popLabel'],
    reducedAlternative: ['glow', 'fadeLabel'],
    label: { key: 'incidentResolved', tone: 'success' },
    sfx: ['autoRepair'],
  },
  {
    id: 'autoRepair',
    tier: 2,
    signal: 'autoRepair',
    parts: ['shield', 'sparkle', 'actorExpression', 'popLabel'],
    reducedAlternative: ['glow', 'actorExpression', 'fadeLabel'],
    label: { key: 'autoRepair', tone: 'info' },
    sfx: ['autoRepair'],
    expression: 'joy',
  },
  {
    // 最大の報酬（企画書23章）。「AUTONOMY STREAK 74 MIN」の大きなタイポグラフィと、Agent たちのハイタッチ
    id: 'autonomyStreak',
    tier: 4,
    signal: 'autonomyStreak',
    parts: ['flash', 'rays', 'confetti', 'highFive', 'actorExpression', 'bigType', 'bigNumber'],
    reducedAlternative: ['fadeBigType', 'fadeBigNumber', 'actorExpression'],
    label: { key: 'autonomyStreak', tone: 'accent' },
    sfx: ['streak'],
    expression: 'joy',
    amount: 'streakMinutes',
  },
  {
    id: 'projectComplete',
    tier: 4,
    signal: 'projectComplete',
    parts: ['flash', 'cameraShake', 'rays', 'confetti', 'coinBurst', 'bigType', 'hitStop', 'actorExpression'],
    reducedAlternative: ['fadeBigType', 'actorExpression'],
    label: { key: 'projectComplete', tone: 'success' },
    sfx: ['fanfare'],
    expression: 'joy',
  },
  {
    // 会社の規模の昇格（Phase 21）。新しく解放された要素は通知で案内する（ui/play/PlayScreen.tsx）
    id: 'companyPromoted',
    tier: 4,
    signal: 'companyPromoted',
    parts: ['flash', 'rays', 'confetti', 'coinBurst', 'bigType', 'actorExpression'],
    reducedAlternative: ['fadeBigType', 'actorExpression'],
    label: { key: 'companyPromoted', tone: 'accent' },
    sfx: ['fanfare'],
    expression: 'joy',
  },
  {
    // 機能の解放（Phase 09）。担当カードの「NEW」バッジと一緒に出す。画面の中心に小さく出し、操作は止めない
    id: 'featureUnlocked',
    tier: 2,
    signal: 'unlock',
    parts: ['sparkle', 'popLabel'],
    reducedAlternative: ['fadeLabel'],
    label: { key: 'featureUnlocked', tone: 'accent' },
    sfx: ['autoRepair'],
  },
  {
    // Workflow Library への保存（企画書25章）。オフィスのライブラリ棚にバインダーが1冊増える（world が ViewModel の binders で出す）
    id: 'workflowSaved',
    tier: 3,
    signal: 'workflowSaved',
    parts: ['sparkle', 'confetti', 'ring', 'bigType'],
    reducedAlternative: ['glow', 'fadeBigType'],
    label: { key: 'workflowSaved', tone: 'accent' },
    sfx: ['automation'],
  },
];

export interface FxTierRule {
  /** 同じ Tier の演出を続けて起動しない時間（ms）。抑制中もコンボは数える */
  readonly cooldownMs: number;
  /** 同じ Tier を同時に再生できる数 */
  readonly maxConcurrent: number;
}

export const fxTiers: Readonly<Record<FxTier, FxTierRule>> = {
  0: { cooldownMs: 60, maxConcurrent: 4 },
  1: { cooldownMs: 150, maxConcurrent: 6 },
  2: { cooldownMs: 400, maxConcurrent: 3 },
  3: { cooldownMs: 1500, maxConcurrent: 1 },
  4: { cooldownMs: 2500, maxConcurrent: 1 },
};

export const fxRules = {
  /**
   * この Tier 以上は「大きな演出」として、Tier をまたいで同時に1つだけ再生する。
   * 再生中に上の Tier が来たら入れ替え、同じか下の Tier は抑制する
   */
  exclusiveFromTier: 3 as FxTier,
  /** 前の Task 完了からこの時間（ms、実時間）以内に次が完了するとコンボが続く */
  comboWindowMs: 4000,
  /** 人間時間の見込みがこの時間（h）以上減る担当で作業が始まったら「自動化」の演出を出す */
  automationMinSavedHours: 2,
  /** Harness の変更で、人間時間の見込みがこの時間（h）以上減ったら「自動化」の演出を出す（Tier 3）。小さな変更はトーストだけ */
  harnessMinSavedHours: 1,
} as const;
