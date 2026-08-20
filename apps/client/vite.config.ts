import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const nodeEnvironment = (globalThis as unknown as {
  process?: { env?: Record<string, string | undefined> };
}).process?.env;
const demoServerPort = Number(nodeEnvironment?.DEMO_SERVER_PORT ?? 3000);

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: `ws://127.0.0.1:${demoServerPort}`,
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
