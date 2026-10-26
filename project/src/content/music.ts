import type { VoiceSlot } from './look/sound';

/**
 * アダプティブ BGM の楽曲データ。音色は content/look/sound.ts のパレットの声部を参照する。
 * ゲームの「勢い」（流れている Task の量・コンボ・直近の完了）から強度の段階を決め、
 * 段階が上がるほどレイヤー（パッド → ベース → ドラム → アルペジオ → 上物）を足していく（audio/music/intensity.ts）。
 *
 * パターンは1小節（stepsPerBar ステップ）の文字列で書く。'.' は休み。
 * - chord：数字のステップで和音全体を鳴らす
 * - bass / arp：数字は和音の構成音の番号（0 = 根音。3 以上は1オクターブ上へ折り返す）
 * - melody：数字は和音の根音からの音階の度数（0〜9）
 * - drum：'x' は強く、'o' は弱く打つ
 */

export type MusicLayerKind = 'chord' | 'bass' | 'arp' | 'melody' | 'drum';

export type MusicLayerId = 'pad' | 'bass' | 'kick' | 'hat' | 'arp' | 'snare' | 'sparkle' | 'streak';

export interface MusicLayer {
  readonly id: MusicLayerId;
  readonly kind: MusicLayerKind;
  readonly voice: VoiceSlot;
  /** この強度の段階から鳴らす */
  readonly fromStage: number;
  readonly pattern: string;
  /** 1音の長さ（ステップ） */
  readonly len: number;
  /** 根音（song.root）からのオクターブ */
  readonly octave: number;
  readonly gain: number;
  readonly pan?: number;
  readonly send?: number;
}

export interface Song {
  /** BPM（4分音符） */
  readonly tempo: number;
  /** 1拍のステップ数（4 = 16分音符） */
  readonly stepsPerBeat: number;
  readonly stepsPerBar: number;
  /** 主音（MIDI ノート番号） */
  readonly root: number;
  /** 音階（主音からの半音。7音） */
  readonly scale: readonly number[];
  /** 1小節ごとの和音（音階の度数。0 = I） */
  readonly progression: readonly number[];
  readonly layers: readonly MusicLayer[];
  /**
   * AUTONOMY STREAK の間だけ足すレイヤー（企画書23章）。勢いの段階に関係なく、Streak が最初の節目を越えている間だけ鳴らす。
   * fromStage の段階以上のときだけ足す
   */
  readonly streakLayers?: readonly MusicLayer[];
  /** 指定すると勢いに関係なくこの段階で鳴らす（結果画面の曲） */
  readonly fixedStage?: number;
}

export type SongId = 'play' | 'result';

const MAJOR = [0, 2, 4, 5, 7, 9, 11] as const;

/** プレイ中の曲：明るく前に進む（I → vi → IV → V） */
const play: Song = {
  tempo: 112,
  stepsPerBeat: 4,
  stepsPerBar: 16,
  root: 60,
  scale: MAJOR,
  progression: [0, 5, 3, 4],
  layers: [
    {
      id: 'pad',
      kind: 'chord',
      voice: 'pad',
      fromStage: 0,
      pattern: '0...............',
      len: 16,
      octave: 0,
      gain: 0.12,
      send: 0.5,
    },
    {
      id: 'bass',
      kind: 'bass',
      voice: 'bass',
      fromStage: 1,
      pattern: '0..0..0...0..2..',
      len: 2,
      octave: -2,
      gain: 0.2,
    },
    {
      id: 'kick',
      kind: 'drum',
      voice: 'kick',
      fromStage: 2,
      pattern: 'x...x...x...x...',
      len: 1,
      octave: -3,
      gain: 0.3,
    },
    {
      id: 'hat',
      kind: 'drum',
      voice: 'hat',
      fromStage: 2,
      pattern: '..x...x...x...xo',
      len: 1,
      octave: 4,
      gain: 0.1,
      pan: 0.3,
    },
    {
      id: 'arp',
      kind: 'arp',
      voice: 'pluck',
      fromStage: 3,
      pattern: '0.1.2.3.2.1.0.2.',
      len: 2,
      octave: 1,
      gain: 0.12,
      pan: -0.25,
      send: 0.3,
    },
    {
      id: 'snare',
      kind: 'drum',
      voice: 'snare',
      fromStage: 4,
      pattern: '....x.......x..o',
      len: 1,
      octave: 2,
      gain: 0.16,
    },
    {
      id: 'sparkle',
      kind: 'melody',
      voice: 'bell',
      fromStage: 4,
      pattern: '4.....2...4.7...',
      len: 4,
      octave: 1,
      gain: 0.08,
      pan: 0.25,
      send: 0.5,
    },
  ],
  streakLayers: [
    {
      // AUTONOMY STREAK：高いところできらきら上っていくアルペジオ（人間なしで回り続けている高揚感）
      id: 'streak',
      kind: 'arp',
      voice: 'bell',
      fromStage: 0,
      pattern: '0.2.4.7.4.7.9.7.',
      len: 1,
      octave: 2,
      gain: 0.07,
      pan: -0.2,
      send: 0.45,
    },
  ],
};

/** 結果画面の曲：ゆったりと振り返る（I → iii → IV → V。テンポを落としてドラムは軽く） */
const result: Song = {
  tempo: 84,
  stepsPerBeat: 4,
  stepsPerBar: 16,
  root: 65,
  scale: MAJOR,
  progression: [0, 2, 3, 4],
  fixedStage: 3,
  layers: [
    {
      id: 'pad',
      kind: 'chord',
      voice: 'pad',
      fromStage: 0,
      pattern: '0.......0.......',
      len: 8,
      octave: -1,
      gain: 0.12,
      send: 0.6,
    },
    {
      id: 'bass',
      kind: 'bass',
      voice: 'bass',
      fromStage: 1,
      pattern: '0.......2...1...',
      len: 4,
      octave: -2,
      gain: 0.16,
    },
    {
      id: 'hat',
      kind: 'drum',
      voice: 'hat',
      fromStage: 2,
      pattern: '....o.......o...',
      len: 1,
      octave: 4,
      gain: 0.07,
      pan: 0.3,
    },
    {
      id: 'arp',
      kind: 'arp',
      voice: 'bell',
      fromStage: 3,
      pattern: '0...2...1...3...',
      len: 4,
      octave: 1,
      gain: 0.08,
      pan: -0.2,
      send: 0.5,
    },
  ],
};

export const songs: Readonly<Record<SongId, Song>> = { play, result };

/** 曲のすべてのレイヤー（Streak の間だけのものを含む） */
export function songLayers(song: Song): readonly MusicLayer[] {
  return song.streakLayers ? [...song.layers, ...song.streakLayers] : song.layers;
}

/** 強度の段階の境目（勢い 0〜1）。i 番目の値以上で段階 i になる。段階の数はこの配列の長さ */
export const musicStageThresholds = [0, 0.15, 0.35, 0.58, 0.8] as const;

/**
 * ゲームの勢いの求め方（audio/music/intensity.ts）。
 * 勢い = Σ weight × min(1, 値 / full)。重みは合計 1。上がるときは速く、下がるときはゆっくり追従する
 */
export const musicMomentum = {
  weights: { running: 0.45, combo: 0.3, recent: 0.25 },
  /** 同時に作業中の Task がこの数で最大 */
  runningFull: 3,
  /** コンボがこの数で最大 */
  comboFull: 6,
  /** 直近 recentWindowMs の間に完了した Task がこの数で最大 */
  recentFull: 4,
  recentWindowMs: 20000,
  /** 1秒あたりに追従する量（勢いの単位） */
  riseRate: 0.5,
  fallRate: 0.08,
} as const;

/** BGM 全体の決まり */
export const musicRules = {
  /** 先読みスケジューリング：この時間（秒）先までのノートを予約する */
  lookahead: 0.1,
  /** 予約を確かめる間隔（ms） */
  tickMs: 25,
  /** 一時停止中に BGM をこもらせるローパスのカットオフ（Hz）と、開いているときの値 */
  pausedCutoff: 520,
  openCutoff: 20000,
  /** フィルタや曲の切り替えにかける時間（秒） */
  fade: 0.4,
  /** レイヤーを足す・減らすときのフェード（秒） */
  layerFade: 1.2,
} as const;

/** レイヤーの種類ごとの音量の形（秒）。chord と bass・arp・melody の hold は音の長さから自動で決める */
export const musicEnvelopes = {
  chord: { attack: 0.35, decay: 0.3, sustain: 0.75, release: 0.6 },
  bass: { attack: 0.005, decay: 0.12, sustain: 0.5, release: 0.08 },
  arp: { attack: 0.003, decay: 0.2, sustain: 0.25, release: 0.15 },
  melody: { attack: 0.003, decay: 0.4, sustain: 0.2, release: 0.4 },
  drum: { attack: 0.001, decay: 0.14, sustain: 0, release: 0.04 },
} as const satisfies Record<MusicLayerKind, { attack: number; decay: number; sustain: number; release: number }>;
