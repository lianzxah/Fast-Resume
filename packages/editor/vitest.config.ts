import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    dir: '__test__',
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
});
