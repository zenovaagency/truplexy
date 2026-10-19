import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPlaygroundAttachmentConfig, type AttachmentConfigResult } from '@/lib/api/endpoints/playground';
import { qk } from '@/lib/query-keys';
import { useScope } from '@/lib/session/scope-context';

/**
 * Image input is planned and not served yet, so every picture control asks
 * this first. When the answer isn't "on", nothing about the pictures shows and
 * the app behaves exactly as it did before the feature.
 */

/** What the server allows. Always read from the config, never hard-coded: the server may change it. */
export interface PictureLimits {
  maxBytes: number;
  maxPerMessage: number;
  contentTypes: string[];
}

export type PictureOffReason = 'plan' | 'no_vision_model';

export type PictureFeature =
  /** Not answered yet. Show nothing. */
  | { status: 'pending' }
  /** The API predates the feature (404). Not an error to show. */
  | { status: 'unavailable' }
  /** The question failed (network, a missing permission). Treated as off. */
  | { status: 'unknown' }
  /** The API has the feature, but this business or server can't use it. */
  | { status: 'off'; reason?: PictureOffReason }
  | { status: 'on'; limits: PictureLimits };

export const PENDING: PictureFeature = { status: 'pending' };

const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Reads a config response. `enabled` without the limits is treated as off: there is nothing to validate against. */
export function featureFromConfig(c: AttachmentConfigResult): PictureFeature {
  if (c.unavailable) return { status: 'unavailable' };
  if (c.enabled !== true) return { status: 'off', reason: c.reason };
  if (!positive(c.max_bytes) || !positive(c.max_per_message) || !Array.isArray(c.content_types) || !c.content_types.length) {
    return { status: 'off' };
  }
  return { status: 'on', limits: { maxBytes: c.max_bytes, maxPerMessage: Math.floor(c.max_per_message), contentTypes: c.content_types } };
}

/** The attach control, drop zone and paste handler exist only when this is true. */
export const canAttach = (f: PictureFeature): f is Extract<PictureFeature, { status: 'on' }> => f.status === 'on';

/** The API serves image input (even if this business can't use it): the guide may stop saying "coming soon". */
export const isServed = (f: PictureFeature) => f.status === 'on' || f.status === 'off';

/** The plan has no picture input: the place for an upgrade hint, which only people who can read it should see. */
export const needsUpgrade = (f: PictureFeature) => f.status === 'off' && f.reason === 'plan';

/** No model can read pictures right now. Business users see nothing; a platform admin may see a hint. */
export const lacksVisionModel = (f: PictureFeature) => f.status === 'off' && f.reason === 'no_vision_model';

/**
 * Asks once per bot (the key holds the scope) and keeps the answer for the
 * session. `turnOff` records what a failed call taught us (the plan has no
 * pictures, or no model can read them) so the control disappears at once.
 */
export function usePictureFeature(enabled = true) {
  const scope = useScope();
  const qc = useQueryClient();
  const key = useMemo(() => qk.bot(scope, 'attachment-config'), [scope]);
  const q = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => getPlaygroundAttachmentConfig(scope, signal),
    enabled,
    staleTime: Infinity,
    retry: false,
    meta: { silent: true },
  });

  const feature = useMemo<PictureFeature>(() => {
    if (!enabled) return { status: 'unknown' };
    if (q.data) return featureFromConfig(q.data);
    return q.isError ? { status: 'unknown' } : PENDING;
  }, [enabled, q.data, q.isError]);

  const turnOff = useCallback(
    (reason: PictureOffReason) => qc.setQueryData<AttachmentConfigResult>(key, { enabled: false, reason }),
    [qc, key],
  );

  return { feature, turnOff };
}
