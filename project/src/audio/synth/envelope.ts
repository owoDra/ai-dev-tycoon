import type { SfxEnvelope } from '../../content/sfx';

/** これより小さい値は無音として扱う（指数カーブは 0 に届かないため） */
export const SILENT = 0.0001;

/**
 * 音量のエンベロープを AudioParam に予約する。t0 から attack で peak、decay で peak × sustain、
 * hold の間保ち、release で消える。戻り値は鳴り終わる時刻（秒）
 */
export function applyEnvelope(param: AudioParam, env: SfxEnvelope, t0: number, peak: number): number {
  const a = t0 + Math.max(env.attack, SILENT);
  const d = a + env.decay;
  const h = d + env.hold;
  const end = h + env.release;
  const sustain = Math.max(peak * env.sustain, SILENT);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, a);
  param.exponentialRampToValueAtTime(sustain, d);
  param.setValueAtTime(sustain, h);
  param.linearRampToValueAtTime(0, end);
  return end;
}

/** attack + decay の間に周波数を滑らせる（glideHz がなければ一定） */
export function applyPitch(param: AudioParam, hz: number, glideHz: number | undefined, env: SfxEnvelope, t0: number) {
  param.setValueAtTime(hz, t0);
  if (glideHz !== undefined) param.exponentialRampToValueAtTime(glideHz, t0 + env.attack + env.decay);
}
