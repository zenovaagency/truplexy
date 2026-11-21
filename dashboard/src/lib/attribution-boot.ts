import { adoptAttribution } from './attribution';

/**
 * Imported first in main.tsx, so it runs before the router is created and reads the address. A link from the
 * marketing site carries the visit's campaign details in `tpx_a`; they are kept and removed from the address
 * here, before any redirect (a signed-in visitor is sent on from the sign-in page) can drop them.
 */
adoptAttribution();
