import type { VoiceSlot } from '../../content/look/sound';
import type { MusicLayer, MusicLayerId, Song } from '../../content/music';

/** 楽曲の1音（予約する前の、時刻を持たない形） */
export interface MusicNote {
  readonly layer: MusicLayerId;
  readonly voice: VoiceSlot;
  readonly midi: number;
  /** 長さ（ステップ） */
  readonly len: number;
  /** 0〜1（layer.gain に掛ける） */
  readonly velocity: number;
}

/** 弱く打つ 'o' の強さ */
const SOFT = 0.6;
const OCTAVE = 12;

/** 音階の i 番目の音（主音からの半音。音階を超えたらオクターブ上） */
function scaleTone(scale: readonly number[], i: number): number {
  const n = scale.length;
  const oct = Math.floor(i / n);
  return oct * OCTAVE + (scale[((i % n) + n) % n] ?? 0);
}

/** 度数 degree の三和音の k 番目の音（k = 3 以上はオクターブ上へ折り返す） */
export function chordTone(scale: readonly number[], degree: number, k: number): number {
  const triad = Math.floor(k / 3) * OCTAVE;
  return triad + scaleTone(scale, degree + (k % 3) * 2);
}

/** パターンの1文字 → 音を出すなら数字（drum は強さ）、休みなら null */
export function patternAt(layer: Pick<MusicLayer, 'kind' | 'pattern'>, pos: number): number | null {
  const ch = layer.pattern[pos % layer.pattern.length];
  if (ch === undefined || ch === '.') return null;
  if (layer.kind === 'drum') return ch === 'o' ? SOFT : 1;
  const n = Number.parseInt(ch, 10);
  return Number.isNaN(n) ? null : n;
}

/** step（曲の頭からの通し番号）で鳴らす音。layers に入っているレイヤーだけを見る */
export function stepNotes(song: Song, step: number, layers: ReadonlySet<MusicLayerId>): MusicNote[] {
  const bar = Math.floor(step / song.stepsPerBar);
  const pos = step % song.stepsPerBar;
  const degree = song.progression[bar % song.progression.length] ?? 0;
  const out: MusicNote[] = [];
  for (const layer of song.layers) {
    if (!layers.has(layer.id)) continue;
    const v = patternAt(layer, pos);
    if (v === null) continue;
    const base = song.root + layer.octave * OCTAVE;
    const note = (midi: number, velocity = 1): MusicNote => ({
      layer: layer.id,
      voice: layer.voice,
      midi,
      len: layer.len,
      velocity,
    });
    switch (layer.kind) {
      case 'chord':
        for (let k = 0; k < 3; k++) out.push(note(base + chordTone(song.scale, degree, k)));
        break;
      case 'bass':
      case 'arp':
        out.push(note(base + chordTone(song.scale, degree, v)));
        break;
      case 'melody':
        out.push(note(base + scaleTone(song.scale, degree + v)));
        break;
      case 'drum':
        out.push(note(base, v));
        break;
    }
  }
  return out;
}
