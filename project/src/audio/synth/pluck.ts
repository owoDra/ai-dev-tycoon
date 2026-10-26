import type { VoiceSpec } from '../../content/look/sound';
import type { VoiceNote } from '../notes';
import { applyEnvelope } from './envelope';

type Pluck = Extract<VoiceSpec, { engine: 'pluck' }>;

/**
 * Karplus-Strong の撥弦音を計算する（純粋関数。random は -1〜1 ではなく 0〜1 を返す関数）。
 * 周期（sampleRate / hz）分のノイズを遅延線に入れ、隣り合う値の平均 × damping を戻し続けると、
 * 高い倍音から先に消えていく弦の音になる。brightness が小さいほど最初のノイズを丸めて柔らかくする
 */
export function karplusStrong(
  hz: number,
  sampleRate: number,
  seconds: number,
  spec: Pick<Pluck, 'damping' | 'brightness'>,
  random: () => number,
): Float32Array {
  const out = new Float32Array(Math.max(1, Math.floor(sampleRate * seconds)));
  const period = Math.max(2, Math.round(sampleRate / hz));
  const line = new Float32Array(period);
  let prev = 0;
  for (let i = 0; i < period; i++) {
    const white = random() * 2 - 1;
    prev = prev + spec.brightness * (white - prev);
    line[i] = prev;
  }
  let idx = 0;
  for (let n = 0; n < out.length; n++) {
    const cur = line[idx] ?? 0;
    const next = line[(idx + 1) % period] ?? 0;
    out[n] = cur;
    line[idx] = spec.damping * 0.5 * (cur + next);
    idx = (idx + 1) % period;
  }
  return out;
}

/** 弦の長さを使い回すためのキャッシュ（コンテキスト・音程・長さごと） */
const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
/** キャッシュの音程の細かさ（cent）。揺らぎの分は playbackRate で合わせる */
const CACHE_CENTS = 50;

function pluckBuffer(ctx: BaseAudioContext, spec: Pluck, hz: number, seconds: number): AudioBuffer {
  let map = cache.get(ctx);
  if (!map) {
    map = new Map();
    cache.set(ctx, map);
  }
  const key = `${hz}:${seconds}:${spec.damping}:${spec.brightness}`;
  const hit = map.get(key);
  if (hit) return hit;
  const data = karplusStrong(hz, ctx.sampleRate, seconds, spec, Math.random);
  const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buffer.getChannelData(0).set(data);
  map.set(key, buffer);
  return buffer;
}

/** 撥弦音。弦の音は CACHE_CENTS 刻みでキャッシュし、端数と glide は playbackRate で合わせる */
export function playPluck(ctx: BaseAudioContext, out: AudioNode, spec: Pluck, note: VoiceNote, t0: number): number {
  const steps = Math.round((1200 * Math.log2(note.hz / 440)) / CACHE_CENTS);
  const baseHz = 440 * 2 ** ((steps * CACHE_CENTS) / 1200);
  const amp = ctx.createGain();
  const end = applyEnvelope(amp.gain, note.env, t0, note.gain);
  const seconds = Math.ceil((end - t0) * 4) / 4 + 0.25;
  const src = ctx.createBufferSource();
  src.buffer = pluckBuffer(ctx, spec, baseHz, seconds);
  src.playbackRate.setValueAtTime(note.hz / baseHz, t0);
  if (note.glideHz !== undefined) {
    src.playbackRate.exponentialRampToValueAtTime(note.glideHz / baseHz, t0 + note.env.attack + note.env.decay);
  }
  src.connect(amp).connect(out);
  src.start(t0);
  src.stop(end + 0.02);
  return end;
}
