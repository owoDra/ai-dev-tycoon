import type { VoiceSpec } from '../../content/look/sound';
import type { VoiceNote } from '../notes';
import { applyEnvelope, applyPitch } from './envelope';

type Noise = Extract<VoiceSpec, { engine: 'noise' }>;

/** ノイズの長さ（秒）。ループして使う */
const NOISE_SECONDS = 1;
const buffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/** コンテキストごとに1つだけ作るホワイトノイズ */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = buffers.get(ctx);
  if (cached) return cached;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  buffers.set(ctx, buffer);
  return buffer;
}

/** ノイズの音源（ループ再生）を t0 から end まで鳴らす */
export function noiseSource(ctx: BaseAudioContext, t0: number, end: number): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  src.loop = true;
  src.start(t0, Math.random() * NOISE_SECONDS);
  src.stop(end + 0.02);
  return src;
}

/** フィルタを通したノイズ。音程はフィルタの中心周波数になる（風・息・シマー） */
export function playNoise(ctx: BaseAudioContext, out: AudioNode, spec: Noise, note: VoiceNote, t0: number): number {
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  filter.type = spec.filter;
  filter.Q.value = spec.q;
  applyPitch(filter.frequency, note.hz, note.glideHz, note.env, t0);
  const end = applyEnvelope(amp.gain, note.env, t0, note.gain);
  noiseSource(ctx, t0, end).connect(filter).connect(amp).connect(out);
  return end;
}
