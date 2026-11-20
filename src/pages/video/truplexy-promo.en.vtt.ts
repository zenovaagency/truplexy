import type { APIRoute } from 'astro';
import { PROMO_CUES, toVtt } from '../../data/promo-transcript';

/** Captions for the promo film, built from the same cues as its transcript. */
export const GET: APIRoute = () =>
  new Response(toVtt(PROMO_CUES), { headers: { 'content-type': 'text/vtt; charset=utf-8' } });
