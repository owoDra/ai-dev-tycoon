import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import type { FC } from 'react';
import { AbsoluteFill, Composition, staticFile } from 'remotion';
import { narration } from './narration';
import { Soundtrack } from './Soundtrack';
import { Assign } from './scenes/Assign';
import { Bring } from './scenes/Bring';
import { Delivered } from './scenes/Delivered';
import { End } from './scenes/End';
import { Facts } from './scenes/Facts';
import { Harness } from './scenes/Harness';
import { Title } from './scenes/Title';
import { Trouble } from './scenes/Trouble';
import { color, FPS, font, sec } from './theme';
import { layout, type SceneId, TRANSITION_SECONDS, totalSeconds, type VoiceDurations } from './timeline';

const sceneComponents: Record<SceneId, FC> = {
  title: Title,
  assign: Assign,
  trouble: Trouble,
  delivered: Delivered,
  harness: Harness,
  bring: Bring,
  facts: Facts,
  end: End,
};

interface IntroProps extends Record<string, unknown> {
  /** ナレーションの長さ（public/voice/durations.json）。なければ音なしの長さで並べる */
  voice: VoiceDurations;
  /** BGM と効果音（public/audio）があるか */
  sound: boolean;
}

const placeScenes = (voice: VoiceDurations) => layout(voice, (id) => narration[id].delay);

const Intro = ({ voice, sound }: IntroProps) => {
  const placed = placeScenes(voice);
  return (
    <AbsoluteFill style={{ fontFamily: font, color: color.ink, backgroundColor: color.bg }}>
      <TransitionSeries>
        {placed.flatMap(({ id, length }, i) => {
          const Scene = sceneComponents[id];
          return [
            ...(i > 0
              ? [
                  <TransitionSeries.Transition
                    key={`${id}-in`}
                    presentation={i % 2 === 0 ? fade() : slide({ direction: 'from-right' })}
                    timing={linearTiming({ durationInFrames: sec(TRANSITION_SECONDS) })}
                  />,
                ]
              : []),
            <TransitionSeries.Sequence key={id} durationInFrames={sec(length)}>
              <Scene />
            </TransitionSeries.Sequence>,
          ];
        })}
      </TransitionSeries>
      {sound && <Soundtrack placed={placed} voice={voice} total={sec(totalSeconds(placed))} />}
    </AbsoluteFill>
  );
};

/** public/ の素材を読み、場面の長さと音の有無を決める */
async function loadMedia(): Promise<IntroProps> {
  const voice = await fetch(staticFile('voice/durations.json'))
    .then((r) => (r.ok ? (r.json() as Promise<VoiceDurations>) : {}))
    .catch(() => ({}));
  const sound = await fetch(staticFile('audio/bgm.wav'), { method: 'HEAD' })
    .then((r) => r.ok)
    .catch(() => false);
  return { voice, sound };
}

export const Root = () => (
  <Composition
    id="Intro"
    component={Intro}
    fps={FPS}
    width={1920}
    height={1080}
    defaultProps={{ voice: {}, sound: false }}
    calculateMetadata={async () => {
      const props = await loadMedia();
      return { props, durationInFrames: Math.round(totalSeconds(placeScenes(props.voice)) * FPS) };
    }}
  />
);
