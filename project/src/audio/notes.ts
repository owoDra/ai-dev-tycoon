import type { SoundPalette, VoiceSpec } from '../content/look/sound';
import type { SfxDef, SfxEnvelope, SfxLayer } from '../content/sfx';

/**
 * 効果音の計算部分（AudioContext に依存しない純粋関数）。
 * カタログのレイヤーにパレット・コンボ・揺らぎを当てはめ、synth/ がそのまま鳴らせる「ノート」の列にする。
 */

/** MIDI ノート番号 → 周波数（Hz）。69 = A4 = 440Hz */
export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** エンベロープの長さ（秒） */
export function envelopeSeconds(env: SfxEnvelope): number {
  return env.attack + env.decay + env.hold + env.release;
}

/** 効果音の長さ（秒）。いちばん遅く終わるレイヤーの終わり */
export function sfxSeconds(def: Pick<SfxDef, 'layers'>): number {
  return Math.max(0, ...def.layers.map((l) => l.at + envelopeSeconds(l.env)));
}

/**
 * コンボで上げる半音の数。combo が minCombo のとき 0 で、1増えるごとに音階を1段上がる（音階を超えたらオクターブ上へ）。
 * maxSteps 段で頭打ちにする
 */
export function comboSemitones(rise: NonNullable<SfxDef['comboRise']>, combo: number): number {
  const steps = Math.min(Math.max(0, combo - rise.minCombo), rise.maxSteps);
  const n = rise.scale.length;
  return Math.floor(steps / n) * 12 + (rise.scale[steps % n] ?? 0);
}

/** 実際に鳴らす1音 */
export interface VoiceNote {
  readonly spec: VoiceSpec;
  /** 鳴り始め（秒、効果音の頭から） */
  readonly at: number;
  readonly hz: number;
  readonly glideHz?: number;
  readonly env: SfxEnvelope;
  /** ピークの音量（パレットの補正と揺らぎを含む） */
  readonly gain: number;
  readonly pan: number;
  readonly send: number;
}

export interface SfxPlayOptions {
  /** いまのコンボ数（comboRise のある効果音だけが使う） */
  readonly combo?: number;
  /** -1〜1 の揺らぎの元（再生では乱数、テストでは固定値）。省略すると揺らぎなし */
  readonly jitter?: () => number;
}

/** 効果音の頭で決める揺らぎ（全レイヤー共通。和音の響きを崩さないよう、レイヤーごとには変えない） */
export function sfxVariation(def: SfxDef, jitter?: () => number): { cents: number; gain: number } {
  if (!jitter) return { cents: 0, gain: 1 };
  const cents = def.variation.cents * jitter();
  const gain = 10 ** ((def.variation.gainDb * (jitter() - 1)) / 20 / 2);
  return { cents, gain };
}

/**
 * 効果音のレイヤーをノートにする。音量の揺らぎは下げる方向だけにして、ピークの合計が 1 を超えないようにする。
 * 音程は可聴域に収まるよう切り詰めない（カタログのテストで可聴域に入っていることを確かめる）
 */
export function resolveSfx(def: SfxDef, palette: SoundPalette, options: SfxPlayOptions = {}): VoiceNote[] {
  if (def.comboRise && (options.combo ?? 0) < def.comboRise.minCombo) return [];
  const shift = def.comboRise ? comboSemitones(def.comboRise, options.combo ?? 0) : 0;
  const v = sfxVariation(def, options.jitter);
  const detune = shift + v.cents / 100;
  return def.layers.map((layer: SfxLayer) => ({
    spec: palette.voices[layer.voice],
    at: layer.at,
    hz: midiToHz(layer.note + detune),
    ...(layer.glideTo !== undefined ? { glideHz: midiToHz(layer.glideTo + detune) } : {}),
    env: layer.env,
    gain: layer.gain * palette.trims[layer.voice] * v.gain,
    pan: layer.pan ?? 0,
    send: (layer.send ?? 0) * palette.space,
  }));
}

/** 画面上の x（CSS px）から、ワールドの出来事のパン（-width〜width）を求める */
export function screenPan(x: number, viewportWidth: number, width: number): number {
  if (viewportWidth <= 0) return 0;
  const centered = (x / viewportWidth) * 2 - 1;
  return Math.max(-1, Math.min(1, centered)) * width;
}

/**
 * ダッキングの音量（BGM に掛ける倍率）を、効果音が鳴り始めてからの経過時間 t（秒）で求める。
 * attack で level まで下げ、hold の間保ち、release で 1 に戻す
 */
export function duckGain(t: number, duck: { level: number; attack: number; hold: number; release: number }): number {
  if (t < 0) return 1;
  if (t < duck.attack) return 1 - (1 - duck.level) * (t / duck.attack);
  if (t < duck.attack + duck.hold) return duck.level;
  const r = (t - duck.attack - duck.hold) / duck.release;
  return r >= 1 ? 1 : duck.level + (1 - duck.level) * r;
}
