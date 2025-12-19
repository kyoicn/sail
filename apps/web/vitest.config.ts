import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom', // Simulates browser environment
    globals: true,
    setupFiles: [], // Add setup files here if needed later
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // Adjust if your source is in ./app or root
      // Since your structure is root-level based on previous context:
      // We might not need complex aliases if you import relatively, 
      // but let's keep it standard.
    },
  },
});