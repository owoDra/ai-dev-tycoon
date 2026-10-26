/**
 * 音色のパレット。効果音（content/sfx.ts）と楽曲（content/music.ts）は音源を直接指定せず、
 * ここの「声部（VoiceSlot）」を参照する。パレットを差し替えると、同じ譜面のまま音色だけが変わる
 * （実行中に audio.setPalette で切り替えられる。`?dev=audio` でも試聴できる）。
 * いまの値は仮の既定値1種で、D4（docs/plan/design-D4-feel.md）で比較して決める。
 */

/** 声部。効果音と楽曲はこの名前で音色を参照する */
export type VoiceSlot =
  /** きらきらした打鍵（コイン・ファンファーレの上声） */
  | 'bell'
  /** 弾いた弦（選択・アルペジオ・刻み） */
  | 'pluck'
  /** 輪郭のはっきりした旋律（警告・ファンファーレの主旋律） */
  | 'lead'
  /** UI のごく短い打音 */
  | 'tick'
  /** 和音の持続音 */
  | 'pad'
  | 'bass'
  /** 息・風・シマー（フィルタを通したノイズ。音程はフィルタの中心周波数） */
  | 'air'
  | 'kick'
  | 'snare'
  | 'hat';

export const voiceSlots = [
  'bell',
  'pluck',
  'lead',
  'tick',
  'pad',
  'bass',
  'air',
  'kick',
  'snare',
  'hat',
] as const satisfies readonly VoiceSlot[];

/** 音源の種類と、その音源に固有の値 */
export type VoiceSpec =
  /** FM：搬送波を変調波で揺らす。index が大きいほど金属的で明るい。indexDecay 秒で index が 1/e に減る */
  | { engine: 'fm'; ratio: number; index: number; indexDecay: number; wave: OscillatorType }
  /** 減算合成：倍音の多い波形を、エンベロープで開閉するローパスフィルタで削る */
  | {
      engine: 'subtractive';
      wave: 'sawtooth' | 'square' | 'triangle';
      /** 重ねる発振器の数と、互いのずれ（cent）。厚みを出す */
      unison: number;
      detuneCents: number;
      /** フィルタの閉じたときのカットオフ（音程の倍数）と、開いたときに足す倍数 */
      cutoff: number;
      envAmount: number;
      q: number;
    }
  /** Karplus-Strong の撥弦音。damping が 1 に近いほど長く響き、brightness が大きいほど硬い */
  | { engine: 'pluck'; damping: number; brightness: number }
  /** 加算合成のベル。非整数倍の倍音を、それぞれの減衰時間で重ねる */
  | { engine: 'bell'; partials: readonly { ratio: number; gain: number; decay: number }[] }
  /** フィルタを通したノイズ。音程はフィルタの中心周波数になる */
  | { engine: 'noise'; filter: 'bandpass' | 'highpass' | 'lowpass'; q: number }
  /** キック：正弦波の音程を sweep 倍から一気に下げる */
  | { engine: 'kick'; sweep: number; sweepTime: number }
  /** スネア：短い胴鳴りの音 ＋ ハイパスしたノイズ */
  | { engine: 'snare'; noiseMix: number; noiseCutoff: number }
  /** ハイハット：高い帯域だけのノイズ */
  | { engine: 'hat'; cutoff: number };

export type VoiceEngine = VoiceSpec['engine'];

export interface SoundPalette {
  readonly voices: Readonly<Record<VoiceSlot, VoiceSpec>>;
  /** 声部ごとの音量の補正（0〜1）。パレットを替えても効果音の音量の合計が 1 を超えないよう、1 以下にする */
  readonly trims: Readonly<Record<VoiceSlot, number>>;
  /** リバーブの長さ（秒）と減衰の鋭さ（大きいほど早く消える）。インパルス応答は起動時にノイズから作る */
  readonly reverb: { readonly seconds: number; readonly decay: number };
  /** 全体のリバーブ送り量に掛ける倍率（0〜1） */
  readonly space: number;
}

const standard: SoundPalette = {
  voices: {
    bell: {
      engine: 'bell',
      partials: [
        { ratio: 1, gain: 1, decay: 0.9 },
        { ratio: 2.76, gain: 0.45, decay: 0.35 },
        { ratio: 5.4, gain: 0.22, decay: 0.16 },
        { ratio: 8.93, gain: 0.1, decay: 0.08 },
      ],
    },
    pluck: { engine: 'pluck', damping: 0.993, brightness: 0.75 },
    lead: { engine: 'fm', ratio: 2, index: 2.2, indexDecay: 0.25, wave: 'sine' },
    tick: { engine: 'fm', ratio: 3.5, index: 1.2, indexDecay: 0.02, wave: 'sine' },
    pad: {
      engine: 'subtractive',
      wave: 'sawtooth',
      unison: 3,
      detuneCents: 9,
      cutoff: 2,
      envAmount: 3,
      q: 0.7,
    },
    bass: {
      engine: 'subtractive',
      wave: 'square',
      unison: 1,
      detuneCents: 0,
      cutoff: 2.5,
      envAmount: 6,
      q: 4,
    },
    air: { engine: 'noise', filter: 'bandpass', q: 6 },
    kick: { engine: 'kick', sweep: 3.2, sweepTime: 0.07 },
    snare: { engine: 'snare', noiseMix: 0.75, noiseCutoff: 1800 },
    hat: { engine: 'hat', cutoff: 7000 },
  },
  trims: {
    bell: 0.9,
    pluck: 1,
    lead: 0.8,
    tick: 0.9,
    pad: 0.55,
    bass: 0.8,
    air: 0.7,
    kick: 1,
    snare: 0.8,
    hat: 0.5,
  },
  reverb: { seconds: 1.8, decay: 3.2 },
  space: 1,
};

export const soundPalettes = { standard } satisfies Record<string, SoundPalette>;
export type SoundPaletteId = keyof typeof soundPalettes;
export const defaultSoundPaletteId: SoundPaletteId = 'standard';
