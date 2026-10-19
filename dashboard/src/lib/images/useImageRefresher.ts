import { useMemo, useRef } from 'react';
import { createImageRefresher } from './refresh';

/**
 * A refresher for the pictures shown in one view. `reload` fetches the owner (the
 * conversation or the ticket) again; it may change identity between renders.
 */
export function useImageRefresher(reload: () => Promise<unknown>) {
  const latest = useRef(reload);
  latest.current = reload;
  return useMemo(() => createImageRefresher(() => latest.current()), []);
}
