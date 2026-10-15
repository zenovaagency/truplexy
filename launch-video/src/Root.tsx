import { Composition, Folder } from 'remotion';
import './fonts';
import { Film, SCENE_COMPONENTS } from './Film';
import { f, FPS, HEIGHT, SCENES, TOTAL_FRAMES, WIDTH, XFADE } from './timeline';

export const RemotionRoot = () => (
  <>
    <Composition id="TruplexyLaunch" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ subtitles: true }} />
    <Composition id="TruplexyLaunchClean" component={Film} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} defaultProps={{ subtitles: false }} />
    <Folder name="Scenes">
      {SCENES.map((s, i) => (
        <Composition
          key={s.id}
          id={`${s.id}-${s.title.replace(/[^A-Za-z0-9]+/g, '-').replace(/-$/, '')}`}
          component={SCENE_COMPONENTS[i]}
          durationInFrames={f(s.end - s.start) + (i === SCENES.length - 1 ? 0 : XFADE)}
          fps={FPS}
          width={WIDTH}
          height={HEIGHT}
        />
      ))}
    </Folder>
  </>
);
