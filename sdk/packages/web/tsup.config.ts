import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    target: 'es2020',
  },
  {
    // The CDN build: <script src="…/truplexy.min.js" defer></script>
    entry: { truplexy: 'src/auto.ts' },
    format: ['iife'],
    outExtension: () => ({ js: '.min.js' }),
    target: 'es2018',
    minify: true,
  },
]);
