import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run in happy-dom, apart from the Vite build: only the "@" alias is shared.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
