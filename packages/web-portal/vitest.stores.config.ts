import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['src/shared/stores/*.ts'],
      exclude: ['src/shared/stores/index.ts', 'src/shared/stores/StoreProvider.tsx'],
      reporter: ['text', 'json', 'html']
    }
  }
});
