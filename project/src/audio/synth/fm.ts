import type { VoiceSpec } from '../../content/look/sound';
import type { VoiceNote } from '../notes';
import { applyEnvelope, applyPitch, SILENT } from './envelope';

type Fm = Extract<VoiceSpec, { engine: 'fm' }>;

/** FM 合成：変調波で搬送波の周波数を揺らす。変調の深さ（index）は indexDecay で減り、打鍵の瞬間だけ明るくなる */
export function playFm(ctx: BaseAudioContext, out: AudioNode, spec: Fm, note: VoiceNote, t0: number): number {
  const carrier = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const depth = ctx.createGain();
  const amp = ctx.createGain();
  carrier.type = spec.wave;
  applyPitch(carrier.frequency, note.hz, note.glideHz, note.env, t0);
  applyPitch(mod.frequency, note.hz * spec.ratio, note.glideHz && note.glideHz * spec.ratio, note.env, t0);
  const peakDepth = spec.index * note.hz * spec.ratio;
  depth.gain.setValueAtTime(peakDepth, t0);
  depth.gain.setTargetAtTime(Math.max(peakDepth * SILENT, SILENT), t0, spec.indexDecay);
  mod.connect(depth).connect(carrier.frequency);
  carrier.connect(amp).connect(out);
  const end = applyEnvelope(amp.gain, note.env, t0, note.gain);
  for (const o of [carrier, mod]) {
    o.start(t0);
    o.stop(end + 0.02);
  }
  return end;
}
