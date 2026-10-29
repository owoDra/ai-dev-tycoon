import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { AbsoluteFill, Composition } from 'remotion';
import { Assign } from './scenes/Assign';
import { Bring } from './scenes/Bring';
import { Delivered } from './scenes/Delivered';
import { End } from './scenes/End';
import { Facts } from './scenes/Facts';
import { Harness } from './scenes/Harness';
import { Title } from './scenes/Title';
import { Trouble } from './scenes/Trouble';
import { color, FPS, font, sec } from './theme';

/** 場面の並びと長さ（秒） */
const scenes = [
  { id: 'title', seconds: 5.5, Scene: Title },
  { id: 'assign', seconds: 7, Scene: Assign },
  { id: 'trouble', seconds: 6, Scene: Trouble },
  { id: 'delivered', seconds: 6, Scene: Delivered },
  { id: 'harness', seconds: 9, Scene: Harness },
  { id: 'bring', seconds: 9, Scene: Bring },
  { id: 'facts', seconds: 6.5, Scene: Facts },
  { id: 'end', seconds: 9, Scene: End },
] as const;

const TRANSITION = sec(0.5);
const total = scenes.reduce((n, s) => n + sec(s.seconds), 0) - TRANSITION * (scenes.length - 1);

const Intro = () => (
  <AbsoluteFill style={{ fontFamily: font, color: color.ink, backgroundColor: color.bg }}>
    <TransitionSeries>
      {scenes.flatMap(({ id, seconds, Scene }, i) => [
        ...(i > 0
          ? [
              <TransitionSeries.Transition
                key={`${id}-in`}
                presentation={i % 2 === 0 ? fade() : slide({ direction: 'from-right' })}
                timing={linearTiming({ durationInFrames: TRANSITION })}
              />,
            ]
          : []),
        <TransitionSeries.Sequence key={id} durationInFrames={sec(seconds)}>
          <Scene />
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
  </AbsoluteFill>
);

export const Root = () => (
  <Composition id="Intro" component={Intro} durationInFrames={total} fps={FPS} width={1920} height={1080} />
);
