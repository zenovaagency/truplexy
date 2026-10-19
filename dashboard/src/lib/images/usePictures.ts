import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createPlaygroundAttachment } from '@/lib/api/endpoints/playground';
import { sha256Hex } from '@/lib/upload';
import { useScope } from '@/lib/session/scope-context';
import { downscale } from './downscale';
import { canAttach, type PictureFeature, type PictureOffReason } from './feature';
import { PictureSet } from './pictures';
import { putObject } from './put';

/**
 * The pictures of the message being written in the playground, for one bot.
 * Switching bot starts an empty set; leaving the page or turning the feature
 * off clears it and revokes the previews.
 */
export function usePictures(feature: PictureFeature, turnOff: (reason: PictureOffReason) => void) {
  const scope = useScope();
  const limits = canAttach(feature) ? feature.limits : null;
  const latest = useRef({ limits, turnOff });
  latest.current = { limits, turnOff };

  const set = useMemo(
    () =>
      new PictureSet({
        register: (body, signal) => createPlaygroundAttachment(scope, body, signal),
        put: putObject,
        hash: sha256Hex,
        prepare: downscale,
        limits: () => latest.current.limits,
        onUnavailable: (p) => p.offReason && latest.current.turnOff(p.offReason),
      }),
    // A new bot is a new set: its pictures were registered for the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope.tenant, scope.bot],
  );

  useEffect(() => () => set.clear(), [set]);
  useEffect(() => {
    if (!limits) set.clear();
  }, [limits, set]);

  const pictures = useSyncExternalStore(set.subscribe, set.getSnapshot);
  return { set, pictures };
}
