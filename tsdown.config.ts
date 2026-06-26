import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  sourcemap: true,
  clean: true,
  format: ['esm'],
  platform: 'node',
  tsconfig: './tsconfig.json',
  target: 'chrome60',
  shims: false,
  dts: true,
});
