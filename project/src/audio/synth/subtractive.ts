import type { VoiceSpec } from '../../content/look/sound';
import type { VoiceNote } from '../notes';
import { applyEnvelope, applyPitch } from './envelope';

type Subtractive = Extract<VoiceSpec, { engine: 'subtractive' }>;

/** 減算合成：倍音の多い波形を重ね、エンベロープで開閉するローパスで削る */
export function playSubtractive(
  ctx: BaseAudioContext,
  out: AudioNode,
  spec: Subtractive,
  note: VoiceNote,
  t0: number,
): number {
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  const nyquist = ctx.sampleRate / 2 - 100;
  const closed = Math.min(note.hz * spec.cutoff, nyquist);
  const open = Math.min(note.hz * (spec.cutoff + spec.envAmount), nyquist);
  filter.type = 'lowpass';
  filter.Q.value = spec.q;
  filter.frequency.setValueAtTime(closed, t0);
  filter.frequency.linearRampToValueAtTime(open, t0 + Math.max(note.env.attack, 0.005));
  filter.frequency.setTargetAtTime(closed, t0 + note.env.attack, Math.max(note.env.decay, 0.01) / 2);
  filter.connect(amp).connect(out);
  const end = applyEnvelope(amp.gain, note.env, t0, note.gain / Math.sqrt(spec.unison));
  for (let i = 0; i < spec.unison; i++) {
    const osc = ctx.createOscillator();
    osc.type = spec.wave;
    applyPitch(osc.frequency, note.hz, note.glideHz, note.env, t0);
    // 発振器を中心から左右に均等にずらす
    osc.detune.value = spec.unison > 1 ? spec.detuneCents * ((i / (spec.unison - 1)) * 2 - 1) : 0;
    osc.connect(filter);
    osc.start(t0);
    osc.stop(end + 0.02);
  }
  return end;
}
