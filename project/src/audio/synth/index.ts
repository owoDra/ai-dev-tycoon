import type { VoiceNote } from '../notes';
import { playBell } from './bell';
import { playHat, playKick, playSnare } from './drums';
import { playFm } from './fm';
import { playNoise } from './noise';
import { playPluck } from './pluck';
import { playSubtractive } from './subtractive';

/** 鳴らす先。dry はパンの後の出力、send はリバーブへの送り（なければ送らない） */
export interface VoiceOutput {
  readonly dry: AudioNode;
  readonly send?: AudioNode;
}

/**
 * 1音を鳴らす。音源（spec.engine）ごとの関数に振り分け、パンとリバーブの送りを付ける。
 * BaseAudioContext を受け取るので、AudioContext でも OfflineAudioContext（事前レンダリング）でも同じように鳴る。
 * 戻り値は鳴り終わる時刻（秒）
 */
export function playVoice(ctx: BaseAudioContext, output: VoiceOutput, note: VoiceNote, t0: number): number {
  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, note.pan));
  panner.connect(output.dry);
  if (output.send && note.send > 0) {
    const send = ctx.createGain();
    send.gain.value = note.send;
    panner.connect(send).connect(output.send);
  }
  const at = t0 + note.at;
  const spec = note.spec;
  switch (spec.engine) {
    case 'fm':
      return playFm(ctx, panner, spec, note, at);
    case 'subtractive':
      return playSubtractive(ctx, panner, spec, note, at);
    case 'pluck':
      return playPluck(ctx, panner, spec, note, at);
    case 'bell':
      return playBell(ctx, panner, spec, note, at);
    case 'noise':
      return playNoise(ctx, panner, spec, note, at);
    case 'kick':
      return playKick(ctx, panner, spec, note, at);
    case 'snare':
      return playSnare(ctx, panner, spec, note, at);
    case 'hat':
      return playHat(ctx, panner, spec, note, at);
  }
}
