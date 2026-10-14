import type { ComponentType } from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { f, SCENES, XFADE } from './timeline';
import { C } from './theme';
import { Scene01 } from './scenes/Scene01';
import { Scene02 } from './scenes/Scene02';
import { Scene03 } from './scenes/Scene03';
import { Scene04 } from './scenes/Scene04';
import { Scene05 } from './scenes/Scene05';
import { Scene06 } from './scenes/Scene06';
import { Scene07 } from './scenes/Scene07';
import { Scene08 } from './scenes/Scene08';
import { Subtitles } from './captions/Subtitles';
import { Soundtrack } from './audio/Soundtrack';

export const SCENE_COMPONENTS: ComponentType[] = [Scene01, Scene02, Scene03, Scene04, Scene05, Scene06, Scene07, Scene08];

export type FilmProps = {
  subtitles: boolean;
};

/**
 * The full film. Each scene runs XFADE frames past its end so it dissolves
 * into the next one (white to white). The soundtrack (narration, ducked
 * music, effects) and the subtitles both read the same timeline.
 */
export const Film = ({ subtitles }: FilmProps) => (
  <AbsoluteFill style={{ background: C.white }}>
    {SCENES.map((s, i) => {
      const Scene = SCENE_COMPONENTS[i];
      const last = i === SCENES.length - 1;
      return (
        <Sequence key={s.id} name={`${s.id} · ${s.title}`} from={f(s.start)} durationInFrames={f(s.end - s.start) + (last ? 0 : XFADE)}>
          <Scene />
        </Sequence>
      );
    })}
    {subtitles && <Subtitles />}
    <Soundtrack />
  </AbsoluteFill>
);
