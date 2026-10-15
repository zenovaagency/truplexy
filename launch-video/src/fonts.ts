import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

/**
 * The brand fonts, as variable woff2 files copied from the site's
 * @fontsource-variable packages. Loaded locally so a render never depends on
 * the network.
 */
export const fontsReady = Promise.all([
  loadFont({ family: 'Plus Jakarta Sans', url: staticFile('fonts/PlusJakartaSans.woff2'), weight: '200 800' }),
  loadFont({ family: 'Geist Mono', url: staticFile('fonts/GeistMono.woff2'), weight: '100 900' }),
]);
