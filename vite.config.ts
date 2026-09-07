/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * When served from GitHub Pages the app lives under `/MINECRAFT_/`, not `/`.
 * Dev server and unit tests run from the root.
 */
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/MINECRAFT_/' : '/',
  plugins: [react()],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/types.ts', 'src/**/*.d.ts'],
    },
  },
}));
