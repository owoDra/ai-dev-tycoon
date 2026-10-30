import { Audio, interpolate, Sequence, staticFile } from 'remotion';
import { clamp } from './components/pop';
import { narration } from './narration';
import { sfxCues } from './sound';
import { FPS, sec } from './theme';
import type { PlacedScene } from './timeline';

/** 音量の釣り合い（0〜1）。BGM はナレーションの間だけ下げる */
const mix = { bgm: 0.32, bgmUnderVoice: 0.12, sfx: 0.55, voice: 1 } as const;
/** BGM を下げる・戻すのにかける長さ（フレーム） */
const DUCK_FRAMES = 8;

/** ナレーションの鳴っている区間（フレーム） */
function voiceWindows(placed: readonly PlacedScene[], voice: Partial<Record<string, number>>) {
  return placed.flatMap((s) => {
    const length = voice[s.id];
    if (length === undefined) return [];
    const from = sec(s.start + narration[s.id].delay);
    return [{ from, to: from + sec(length) }];
  });
}

/**
 * BGM・効果音・ナレーション。素材は capture/sound.ts と capture/voice.ts が public/ に書き出す。
 * 場面の位置（placed）は映像と同じ layout から受け取る
 */
export const Soundtrack = ({
  placed,
  voice,
  total,
}: {
  placed: readonly PlacedScene[];
  voice: Partial<Record<string, number>>;
  total: number;
}) => {
  const windows = voiceWindows(placed, voice);
  const bgmVolume = (frame: number) => {
    const duck = Math.max(
      0,
      ...windows.map((w) =>
        Math.min(
          interpolate(frame, [w.from - DUCK_FRAMES, w.from], [0, 1], clamp),
          interpolate(frame, [w.to, w.to + DUCK_FRAMES * 2], [1, 0], clamp),
        ),
      ),
    );
    const fade = Math.min(
      interpolate(frame, [0, FPS / 2], [0, 1], clamp),
      interpolate(frame, [total - FPS * 2, total], [1, 0], clamp),
    );
    return (mix.bgm + (mix.bgmUnderVoice - mix.bgm) * duck) * fade;
  };
  const startOf = (id: string) => placed.find((s) => s.id === id)?.start ?? 0;
  return (
    <>
      <Audio src={staticFile('audio/bgm.wav')} volume={bgmVolume} />
      {sfxCues.map((cue) => (
        <Sequence key={`${cue.scene}-${cue.at}-${cue.id}`} from={sec(startOf(cue.scene) + cue.at)} layout="none">
          <Audio src={staticFile(`audio/sfx/${cue.id}.wav`)} volume={mix.sfx * (cue.volume ?? 1)} />
        </Sequence>
      ))}
      {placed.map((s) =>
        voice[s.id] === undefined ? null : (
          <Sequence key={`voice-${s.id}`} from={sec(s.start + narration[s.id].delay)} layout="none">
            <Audio src={staticFile(`voice/${s.id}.wav`)} volume={mix.voice} />
          </Sequence>
        ),
      )}
    </>
  );
};
