import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  target: 'es2020',
  external: ['react', '@truplexy/web'],
  // Next.js App Router: these are client components.
  banner: { js: "'use client';" },
});
