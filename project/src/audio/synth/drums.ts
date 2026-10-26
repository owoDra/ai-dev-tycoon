import type { VoiceSpec } from '../../content/look/sound';
import type { VoiceNote } from '../notes';
import { applyEnvelope } from './envelope';
import { noiseSource } from './noise';

type Kick = Extract<VoiceSpec, { engine: 'kick' }>;
type Snare = Extract<VoiceSpec, { engine: 'snare' }>;
type Hat = Extract<VoiceSpec, { engine: 'hat' }>;

/** キック：正弦波の音程を sweep 倍から sweepTime で一気に下げる */
export function playKick(ctx: BaseAudioContext, out: AudioNode, spec: Kick, note: VoiceNote, t0: number): number {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.frequency.setValueAtTime(note.hz * spec.sweep, t0);
  osc.frequency.exponentialRampToValueAtTime(note.hz, t0 + spec.sweepTime);
  osc.connect(amp).connect(out);
  const end = applyEnvelope(amp.gain, note.env, t0, note.gain);
  osc.start(t0);
  osc.stop(end + 0.02);
  return end;
}

/** スネア：音程のある短い胴鳴り（三角波）とハイパスしたノイズを混ぜる */
export function playSnare(ctx: BaseAudioContext, out: AudioNode, spec: Snare, note: VoiceNote, t0: number): number {
  const amp = ctx.createGain();
  amp.connect(out);
  const end = applyEnvelope(amp.gain, note.env, t0, note.gain);
  const body = ctx.createOscillator();
  const bodyGain = ctx.createGain();
  body.type = 'triangle';
  body.frequency.setValueAtTime(note.hz, t0);
  bodyGain.gain.setValueAtTime(1 - spec.noiseMix, t0);
  bodyGain.gain.setTargetAtTime(0, t0, 0.03);
  body.connect(bodyGain).connect(amp);
  body.start(t0);
  body.stop(end + 0.02);
  const hp = ctx.createBiquadFilter();
  const noiseGain = ctx.createGain();
  hp.type = 'highpass';
  hp.frequency.value = spec.noiseCutoff;
  noiseGain.gain.value = spec.noiseMix;
  noiseSource(ctx, t0, end).connect(hp).connect(noiseGain).connect(amp);
  return end;
}

/** ハイハット：高い帯域だけのノイズ */
export function playHat(ctx: BaseAudioContext, out: AudioNode, spec: Hat, note: VoiceNote, t0: number): number {
  const hp = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  hp.type = 'highpass';
  hp.frequency.value = Math.min(spec.cutoff, ctx.sampleRate / 2 - 100);
  const end = applyEnvelope(amp.gain, note.env, t0, note.gain);
  noiseSource(ctx, t0, end).connect(hp).connect(amp).connect(out);
  return end;
}
