import type { VoiceSpec } from '../../content/look/sound';
import type { VoiceNote } from '../notes';
import { applyEnvelope } from './envelope';

type Bell = Extract<VoiceSpec, { engine: 'bell' }>;

/** 加算合成のベル：非整数倍の倍音（正弦波）を重ね、高い倍音ほど早く消す */
export function playBell(ctx: BaseAudioContext, out: AudioNode, spec: Bell, note: VoiceNote, t0: number): number {
  const amp = ctx.createGain();
  amp.connect(out);
  const total = spec.partials.reduce((sum, p) => sum + p.gain, 0) || 1;
  const end = applyEnvelope(amp.gain, note.env, t0, note.gain);
  for (const p of spec.partials) {
    const hz = note.hz * p.ratio;
    if (hz >= ctx.sampleRate / 2) continue;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(hz, t0);
    if (note.glideHz !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(note.glideHz * p.ratio, t0 + note.env.attack + note.env.decay);
    }
    g.gain.setValueAtTime(p.gain / total, t0);
    g.gain.setTargetAtTime(0, t0, p.decay);
    osc.connect(g).connect(amp);
    osc.start(t0);
    osc.stop(end + 0.02);
  }
  return end;
}
