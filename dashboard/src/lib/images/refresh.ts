/**
 * A picture's `url` is signed and lasts an hour. When one stops loading (or its
 * `url_expires_at` has passed), the conversation or ticket that owns it is
 * reloaded once and the fresh URL swapped in. A URL is never stored: it lives
 * in the query cache and the page, nowhere that outlives the tab.
 */
export interface ImageRefresher {
  /**
   * Reloads the owner so the picture gets a fresh URL. Pictures failing together share one reload.
   * Resolves false, without reloading, when this picture already had its one reload and still doesn't load.
   */
  request(id: string): Promise<boolean>;
  /** This picture has had its reload. */
  tried(id: string): boolean;
  /** The picture loaded: it may use its reload again when the next URL expires. */
  loaded(id: string): void;
  /** The person asked to try again by hand. */
  reset(id: string): void;
}

export function createImageRefresher(reload: () => Promise<unknown>): ImageRefresher {
  const tried = new Set<string>();
  let inflight: Promise<void> | null = null;
  return {
    async request(id) {
      if (tried.has(id)) return false;
      tried.add(id);
      inflight ??= Promise.resolve(reload())
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => {
          inflight = null;
        });
      await inflight;
      return true;
    },
    tried: (id) => tried.has(id),
    loaded: (id) => void tried.delete(id),
    reset: (id) => void tried.delete(id),
  };
}

/** True once a picture's signed link has run out (or is about to, within `slackMs`). */
export function urlExpired(urlExpiresAt: string, now = Date.now(), slackMs = 15_000) {
  const at = Date.parse(urlExpiresAt);
  return Number.isFinite(at) && at - slackMs <= now;
}
