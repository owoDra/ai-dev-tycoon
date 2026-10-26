/**
 * 音色のパレット。効果音（content/sfx.ts）と楽曲（content/music.ts）は音源を直接指定せず、
 * ここの「声部（VoiceSlot）」を参照する。パレットを差し替えると、同じ譜面のまま音色だけが変わる
 * （実行中に audio.setPalette で切り替えられる。`?dev=audio` でも試聴できる）。
 * パレットは BGM の曲調（テンポとハネ）と、効果音と BGM の音量バランスも持つ。
 * 既定は D4 で採用した「ウッド＆マリンバ」（docs/decisions/D4-feel.md）。
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
  /** BGM の曲調。tempo は曲（content/music.ts）のテンポに掛ける倍率、swing は裏の16分音符を遅らせる割合（0 でまっすぐ） */
  readonly music: { readonly tempo: number; readonly swing: number };
  /** 効果音と BGM の音量バランス（0〜1）。設定画面の音量に掛ける */
  readonly mix: { readonly sfx: number; readonly music: number };
}

/** ウッド＆マリンバ：木の打鍵と柔らかい弦。短い部屋の響きで、BGM は少しハネる */
const wood: SoundPalette = {
  voices: {
    // マリンバ：基音と約4倍・約10倍の倍音を、短く減衰させる
    bell: {
      engine: 'bell',
      partials: [
        { ratio: 1, gain: 1, decay: 0.35 },
        { ratio: 3.93, gain: 0.35, decay: 0.09 },
        { ratio: 9.9, gain: 0.12, decay: 0.03 },
      ],
    },
    pluck: { engine: 'pluck', damping: 0.985, brightness: 0.4 },
    // 木管のような丸い旋律
    lead: { engine: 'fm', ratio: 1, index: 0.8, indexDecay: 0.3, wave: 'sine' },
    // ウッドブロック
    tick: { engine: 'fm', ratio: 2.7, index: 2.4, indexDecay: 0.012, wave: 'sine' },
    pad: {
      engine: 'subtractive',
      wave: 'triangle',
      unison: 2,
      detuneCents: 6,
      cutoff: 1.6,
      envAmount: 1.5,
      q: 0.5,
    },
    // ウッドベース
    bass: {
      engine: 'subtractive',
      wave: 'triangle',
      unison: 1,
      detuneCents: 0,
      cutoff: 2,
      envAmount: 3,
      q: 1,
    },
    air: { engine: 'noise', filter: 'bandpass', q: 3 },
    kick: { engine: 'kick', sweep: 2.2, sweepTime: 0.09 },
    // ブラシ
    snare: { engine: 'snare', noiseMix: 0.45, noiseCutoff: 1100 },
    hat: { engine: 'hat', cutoff: 5200 },
  },
  trims: {
    bell: 1,
    pluck: 1,
    lead: 0.8,
    tick: 0.9,
    pad: 0.5,
    bass: 0.9,
    air: 0.6,
    kick: 0.9,
    snare: 0.7,
    hat: 0.45,
  },
  reverb: { seconds: 1.1, decay: 4 },
  space: 0.7,
  music: { tempo: 0.9, swing: 0.2 },
  mix: { sfx: 1, music: 0.9 },
};

export const soundPalettes = { wood } satisfies Record<string, SoundPalette>;
export type SoundPaletteId = keyof typeof soundPalettes;
export const defaultSoundPaletteId: SoundPaletteId = 'wood';
