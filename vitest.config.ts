/// <reference types='vitest/globals' />
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    threads: true,
    coverage: {
      provider: 'c8',
      enabled: true,
      include: ['src/**'],
      all: true,
      // lines: 99,
      // functions: 99,
      // branches: 99,
      // statements: 99,
      reporter: ['html', 'lcovonly', 'text-summary'],
    },
    environment: 'node',
    globals: true,
    snapshotFormat: {
      escapeString: false,
      printBasicPrototype: false,
    },
    watch: false,
  },
});
