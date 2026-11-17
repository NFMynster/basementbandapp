import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { AbsoluteFill, Composition } from "remotion";
import { Backdrop } from "./components/Backdrop";
import { Intro } from "./scenes/Intro";
import { MidiPads } from "./scenes/MidiPads";
import { Outro } from "./scenes/Outro";
import { Pitch } from "./scenes/Pitch";
import { MidiEditor } from "./scenes/MidiEditor";
import { Plugins } from "./scenes/Plugins";
import { Record } from "./scenes/Record";
import { Sound } from "./scenes/Sound";
import { Takes } from "./scenes/Takes";
import { Values } from "./scenes/Values";
import { fps } from "./theme";

// Scene lengths in seconds; each caption stays up for the whole scene.
const scenes = [
  [Intro, 3.6],
  [Pitch, 4.2],
  [Record, 7.6],
  [Takes, 6.0],
  [Sound, 6.2],
  [MidiPads, 5.2],
  [MidiEditor, 5.6],
  [Plugins, 6.6],
  [Values, 6.8],
  [Outro, 6.0],
] as const;
const frames = (seconds: number) => Math.round(seconds * fps);
const transition = frames(0.35);
const duration =
  scenes.reduce((sum, [, seconds]) => sum + frames(seconds), 0) -
  transition * (scenes.length - 1);

const Video = () => (
  <AbsoluteFill>
    <Backdrop />
    <TransitionSeries>
      {scenes.flatMap(([Scene, seconds], i) => [
        ...(i
          ? [
              <TransitionSeries.Transition
                key={`t${i}`}
                presentation={fade()}
                timing={linearTiming({ durationInFrames: transition })}
              />,
            ]
          : []),
        <TransitionSeries.Sequence key={i} durationInFrames={frames(seconds)}>
          <Scene />
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
  </AbsoluteFill>
);

export const RemotionRoot = () => (
  <Composition
    id="BasementBand"
    component={Video}
    durationInFrames={duration}
    fps={fps}
    width={1920}
    height={1080}
  />
);
