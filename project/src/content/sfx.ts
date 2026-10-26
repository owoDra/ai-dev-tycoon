import type { FxTier } from './fx';
import type { VoiceSlot } from './look/sound';

/**
 * 効果音のカタログ（企画書46章：音は補助。ミュートしても情報は失われない）。
 * 1つの効果音は「レイヤー」の重ね合わせで、各レイヤーは音色のパレット（content/look/sound.ts）の声部を参照する。
 * 新しい効果音はここにデータを足すだけで増やせる。演出との対応は content/fx.ts の sfx に書く。
 * 音程は MIDI ノート番号（60 = C4 = 約 262Hz）。air（ノイズ）の声部では、フィルタの中心周波数になる。
 */

/** 音量の時間変化（秒）。sustain は 0〜1（ピークに対する割合）。hold の間 sustain を保ってから release で消える */
export interface SfxEnvelope {
  readonly attack: number;
  readonly decay: number;
  readonly sustain: number;
  readonly hold: number;
  readonly release: number;
}

export interface SfxLayer {
  readonly voice: VoiceSlot;
  /** 鳴り始め（秒、効果音の頭から） */
  readonly at: number;
  readonly note: number;
  /** 指定すると、attack + decay の間にこの音程まで滑らせる */
  readonly glideTo?: number;
  readonly env: SfxEnvelope;
  /** ピークの音量（0〜1）。1つの効果音のレイヤーの合計が 1 を超えないようにする */
  readonly gain: number;
  /** -1（左）〜 1（右）。ワールドの出来事は、さらに画面上の位置でパンが付く */
  readonly pan?: number;
  /** リバーブへの送り量（0〜1） */
  readonly send?: number;
}

/** 鳴らすバス。ui はマスターの手前で効果音とは別に音量をまとめる */
export type SfxBus = 'ui' | 'sfx';

export type SfxId =
  | 'uiHover'
  | 'uiClick'
  | 'uiToggle'
  | 'panelOpen'
  | 'panelClose'
  | 'select'
  | 'taskStart'
  | 'taskDone'
  | 'coin'
  | 'combo'
  | 'reviewCatch'
  | 'warning'
  | 'failure'
  | 'autoRepair'
  | 'bottleneckCleared'
  | 'automation'
  | 'fanfare'
  | 'streak';

export interface SfxDef {
  readonly id: SfxId;
  readonly bus: SfxBus;
  /** 報酬の大きさ（content/fx.ts の Tier と同じ尺度）。audioRules.duckFromTier 以上は BGM を一時的に下げる */
  readonly tier: FxTier;
  readonly layers: readonly SfxLayer[];
  /** 再生のたびに加える揺らぎ（音程 cent・音量 dB の最大幅）。単調にならないようにする */
  readonly variation: { readonly cents: number; readonly gainDb: number };
  /** 起動後のアイドル時間に OfflineAudioContext で焼き込んでおく（レイヤーの多い効果音） */
  readonly prerender?: boolean;
  /** コンボで音程を上げる。combo が minCombo のとき元の音程で、1増えるごとに scale を1段上がる（maxSteps 段まで） */
  readonly comboRise?: { readonly minCombo: number; readonly scale: readonly number[]; readonly maxSteps: number };
}

const env = (attack: number, decay: number, sustain: number, hold: number, release: number): SfxEnvelope => ({
  attack,
  decay,
  sustain,
  hold,
  release,
});

/** ごく短い打音 */
const blip = env(0.002, 0.05, 0, 0, 0.03);
/** 弾いて自然に消える音 */
const pluckEnv = env(0.002, 0.25, 0.2, 0, 0.25);
/** 鐘のように長く消える音 */
const ring = env(0.002, 0.5, 0.15, 0, 0.6);

const STEADY = { cents: 0, gainDb: 0.5 } as const;
const LIGHT = { cents: 15, gainDb: 1 } as const;
const LIVELY = { cents: 30, gainDb: 1.5 } as const;

/** メジャー・ペンタトニック（半音） */
export const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** 和音を順に鳴らす（ずらし）レイヤー */
function strum(voice: VoiceSlot, at: number, notes: readonly number[], gap: number, gain: number, e: SfxEnvelope) {
  return notes.map((note, i): SfxLayer => ({ voice, at: at + i * gap, note, env: e, gain, send: 0.3 }));
}

export const sfxCatalog: readonly SfxDef[] = [
  // ── UI ──
  {
    id: 'uiHover',
    bus: 'ui',
    tier: 0,
    layers: [{ voice: 'tick', at: 0, note: 96, env: env(0.002, 0.025, 0, 0, 0.02), gain: 0.12 }],
    variation: LIGHT,
  },
  {
    id: 'uiClick',
    bus: 'ui',
    tier: 0,
    layers: [
      { voice: 'tick', at: 0, note: 84, env: blip, gain: 0.35 },
      { voice: 'air', at: 0, note: 100, env: env(0.001, 0.02, 0, 0, 0.01), gain: 0.12 },
    ],
    variation: LIGHT,
  },
  {
    id: 'uiToggle',
    bus: 'ui',
    tier: 0,
    layers: [
      { voice: 'tick', at: 0, note: 79, env: blip, gain: 0.3 },
      { voice: 'tick', at: 0.05, note: 86, env: blip, gain: 0.3 },
    ],
    variation: STEADY,
  },
  {
    id: 'panelOpen',
    bus: 'ui',
    tier: 0,
    layers: [
      { voice: 'air', at: 0, note: 76, glideTo: 96, env: env(0.04, 0.08, 0, 0, 0.05), gain: 0.12 },
      { voice: 'pluck', at: 0.02, note: 72, env: pluckEnv, gain: 0.25, send: 0.15 },
      { voice: 'pluck', at: 0.06, note: 79, env: pluckEnv, gain: 0.25, send: 0.15 },
    ],
    variation: STEADY,
  },
  {
    id: 'panelClose',
    bus: 'ui',
    tier: 0,
    layers: [
      { voice: 'pluck', at: 0, note: 79, env: pluckEnv, gain: 0.22, send: 0.1 },
      { voice: 'pluck', at: 0.04, note: 72, env: pluckEnv, gain: 0.22, send: 0.1 },
    ],
    variation: STEADY,
  },
  // ── ゲーム ──
  {
    id: 'select',
    bus: 'sfx',
    tier: 0,
    layers: [
      { voice: 'pluck', at: 0, note: 76, env: pluckEnv, gain: 0.35, send: 0.15 },
      { voice: 'tick', at: 0, note: 88, env: blip, gain: 0.12 },
    ],
    variation: LIGHT,
  },
  {
    id: 'taskStart',
    bus: 'sfx',
    tier: 0,
    layers: [
      { voice: 'air', at: 0, note: 84, glideTo: 96, env: env(0.05, 0.1, 0, 0, 0.05), gain: 0.12 },
      { voice: 'pluck', at: 0.03, note: 67, env: pluckEnv, gain: 0.25, send: 0.1 },
    ],
    variation: LIVELY,
  },
  {
    id: 'taskDone',
    bus: 'sfx',
    tier: 1,
    layers: [
      { voice: 'pluck', at: 0, note: 72, env: pluckEnv, gain: 0.25, send: 0.2 },
      { voice: 'pluck', at: 0.06, note: 79, env: pluckEnv, gain: 0.25, send: 0.2 },
      { voice: 'tick', at: 0.06, note: 91, env: blip, gain: 0.1 },
    ],
    variation: LIGHT,
  },
  {
    // 音程の違うベルを重ねて「チャリン」と鳴らす
    id: 'coin',
    bus: 'sfx',
    tier: 1,
    layers: [
      { voice: 'bell', at: 0.08, note: 88, env: ring, gain: 0.22, pan: -0.2, send: 0.25 },
      { voice: 'bell', at: 0.12, note: 95, env: ring, gain: 0.18, pan: 0.2, send: 0.25 },
      { voice: 'bell', at: 0.16, note: 100, env: env(0.002, 0.3, 0.1, 0, 0.4), gain: 0.14, send: 0.3 },
    ],
    variation: LIVELY,
    prerender: true,
  },
  {
    // コンボが続くたびにペンタトニックの音階を1段ずつ上げる
    id: 'combo',
    bus: 'sfx',
    tier: 1,
    layers: [
      { voice: 'bell', at: 0.02, note: 79, env: ring, gain: 0.3, send: 0.3 },
      { voice: 'pluck', at: 0.02, note: 67, env: pluckEnv, gain: 0.2, send: 0.2 },
    ],
    variation: STEADY,
    comboRise: { minCombo: 2, scale: PENTATONIC, maxSteps: 10 },
  },
  {
    // 盾が受け止める：短い2音の上行 ＋ シマー
    id: 'reviewCatch',
    bus: 'sfx',
    tier: 2,
    layers: [
      { voice: 'lead', at: 0, note: 76, env: env(0.005, 0.12, 0.3, 0.02, 0.15), gain: 0.25, send: 0.2 },
      { voice: 'lead', at: 0.1, note: 83, env: env(0.005, 0.2, 0.3, 0.05, 0.3), gain: 0.25, send: 0.3 },
      { voice: 'air', at: 0.1, note: 108, env: env(0.05, 0.3, 0, 0, 0.3), gain: 0.15, send: 0.5 },
    ],
    variation: LIGHT,
  },
  {
    id: 'warning',
    bus: 'sfx',
    tier: 2,
    layers: [
      { voice: 'lead', at: 0, note: 81, env: env(0.005, 0.08, 0.5, 0.04, 0.08), gain: 0.28, send: 0.1 },
      { voice: 'lead', at: 0.18, note: 81, env: env(0.005, 0.08, 0.5, 0.04, 0.12), gain: 0.28, send: 0.15 },
    ],
    variation: STEADY,
  },
  {
    // 下がっていく音で「うまくいかなかった」を伝える（表示は品質低下のラベルとアイコン）
    id: 'failure',
    bus: 'sfx',
    tier: 1,
    layers: [
      { voice: 'lead', at: 0, note: 67, glideTo: 60, env: env(0.005, 0.3, 0.2, 0, 0.2), gain: 0.25, send: 0.15 },
      { voice: 'bass', at: 0, note: 43, env: env(0.005, 0.25, 0, 0, 0.15), gain: 0.3 },
    ],
    variation: LIGHT,
  },
  {
    // Hook による自動修復（Phase 12 で事件の自動修復に使う。いまはサウンドテストで試聴できる）
    id: 'autoRepair',
    bus: 'sfx',
    tier: 2,
    layers: [
      ...strum('pluck', 0, [72, 76, 79], 0.05, 0.18, pluckEnv),
      { voice: 'tick', at: 0.15, note: 96, env: blip, gain: 0.1 },
      { voice: 'bell', at: 0.18, note: 91, env: ring, gain: 0.2, send: 0.35 },
    ],
    variation: LIGHT,
    prerender: true,
  },
  {
    // 詰まりが流れ出す：風が吹き抜ける ＋ 和音のかき鳴らし ＋ ベル
    id: 'bottleneckCleared',
    bus: 'sfx',
    tier: 3,
    layers: [
      { voice: 'air', at: 0, note: 72, glideTo: 103, env: env(0.25, 0.2, 0, 0, 0.3), gain: 0.14, send: 0.4 },
      ...strum('pluck', 0.22, [72, 76, 79, 84], 0.035, 0.15, ring),
      { voice: 'bell', at: 0.36, note: 96, env: ring, gain: 0.16, send: 0.4 },
      { voice: 'kick', at: 0.22, note: 36, env: env(0.001, 0.25, 0, 0, 0.05), gain: 0.1 },
    ],
    variation: STEADY,
    prerender: true,
  },
  {
    id: 'automation',
    bus: 'sfx',
    tier: 3,
    layers: [
      ...strum('lead', 0, [72, 76, 79, 84, 88], 0.06, 0.11, env(0.003, 0.12, 0.3, 0, 0.2)),
      { voice: 'bell', at: 0.3, note: 96, env: ring, gain: 0.16, send: 0.45 },
      { voice: 'air', at: 0.3, note: 105, env: env(0.08, 0.5, 0, 0, 0.5), gain: 0.12, send: 0.6 },
      { voice: 'kick', at: 0.3, note: 36, env: env(0.001, 0.25, 0, 0, 0.05), gain: 0.1 },
      { voice: 'bass', at: 0.3, note: 48, env: env(0.005, 0.3, 0.2, 0.1, 0.3), gain: 0.06 },
    ],
    variation: STEADY,
    prerender: true,
  },
  {
    // 大成功のファンファーレ：IV → V → I の短い和音の進行
    id: 'fanfare',
    bus: 'sfx',
    tier: 4,
    layers: [
      ...strum('lead', 0, [65, 69, 72], 0.01, 0.06, env(0.005, 0.15, 0.4, 0.05, 0.1)),
      ...strum('lead', 0.24, [67, 71, 74], 0.01, 0.06, env(0.005, 0.15, 0.4, 0.05, 0.1)),
      ...strum('lead', 0.5, [72, 76, 79, 84], 0.015, 0.06, env(0.005, 0.3, 0.5, 0.5, 0.6)),
      { voice: 'bell', at: 0.5, note: 96, env: ring, gain: 0.1, send: 0.5 },
      { voice: 'bass', at: 0, note: 41, env: env(0.005, 0.15, 0.3, 0.05, 0.05), gain: 0.05 },
      { voice: 'bass', at: 0.24, note: 43, env: env(0.005, 0.15, 0.3, 0.05, 0.05), gain: 0.05 },
      { voice: 'bass', at: 0.5, note: 48, env: env(0.005, 0.3, 0.4, 0.5, 0.5), gain: 0.05 },
      { voice: 'kick', at: 0.5, note: 36, env: env(0.001, 0.3, 0, 0, 0.05), gain: 0.05 },
      { voice: 'air', at: 0.5, note: 106, env: env(0.1, 0.6, 0, 0, 0.6), gain: 0.05, send: 0.6 },
    ],
    variation: STEADY,
    prerender: true,
  },
  {
    // Autonomy Streak（Phase 12 で使う）：上昇するアルペジオ ＋ シマー
    id: 'streak',
    bus: 'sfx',
    tier: 3,
    layers: [
      ...strum('bell', 0, [72, 74, 76, 79, 81, 84, 86, 88], 0.07, 0.1, env(0.002, 0.25, 0.1, 0, 0.3)),
      { voice: 'air', at: 0.2, note: 104, glideTo: 110, env: env(0.3, 0.4, 0, 0, 0.5), gain: 0.12, send: 0.7 },
    ],
    variation: STEADY,
    prerender: true,
  },
];

/** 効果音全体の決まり */
export const audioRules = {
  /** 1つの効果音の長さ（レイヤーの開始 ＋ エンベロープ）の上限（秒）。リバーブの残響は含めない */
  maxSfxSeconds: 2.5,
  /** 可聴域（Hz） */
  minHz: 20,
  maxHz: 20000,
  /** この Tier 以上の効果音が鳴っている間は BGM を下げる（サイドチェイン風のダッキング） */
  duckFromTier: 3 as FxTier,
  /** ダッキング：BGM の音量の倍率・下げきるまで・戻し始めるまで・戻しきるまで（秒） */
  duck: { level: 0.35, attack: 0.04, hold: 0.9, release: 0.8 },
  /** ワールドの出来事のパンの幅（画面の端で ±この値） */
  spatialWidth: 0.7,
  /** ホバー音を続けて鳴らさない間隔（ms） */
  hoverCooldownMs: 70,
  /** 同じ効果音を続けて鳴らさない間隔（ms）。大量の Task 完了が同時に来ても音が割れないようにする */
  repeatCooldownMs: 45,
} as const;

/** ゲームの出来事のうち、演出（content/fx.ts）を通らずに鳴らすもの。どれも画面上の変化と一緒に鳴る */
export const eventSfx = {
  /** Task の作業が始まる（島の作業中の表示とパケットの移動と一緒に鳴る） */
  TaskStarted: 'taskStart',
  /** 問題のトーストが新しく出る（トーストのアイコンと文言と一緒に鳴る） */
  problemShown: 'warning',
} as const satisfies Record<string, SfxId>;

export function getSfx(id: SfxId): SfxDef {
  const def = sfxCatalog.find((d) => d.id === id);
  if (!def) throw new Error(`効果音 ${id} がない`);
  return def;
}
