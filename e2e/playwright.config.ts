import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { e2eClientPort, e2eDatabasePath, e2eServerPort } from './test-environment';

const configDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = resolve(configDirectory, '..');

export default defineConfig({
  testDir: configDirectory,
  globalSetup: resolve(configDirectory, 'global-setup.ts'),
  timeout: 90_000,
  actionTimeout: 10_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${e2eClientPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'npm run db:reset && npm run dev --workspace @widgetforge-demo/server',
      cwd: rootDirectory,
      url: `http://127.0.0.1:${e2eServerPort}/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        DATABASE_PATH: e2eDatabasePath,
        NODE_ENV: 'test',
        SERVER_HOST: '127.0.0.1',
        SERVER_PORT: String(e2eServerPort),
      },
    },
    {
      command: `npm run dev --workspace @widgetforge-demo/client -- --port ${e2eClientPort}`,
      cwd: rootDirectory,
      url: `http://127.0.0.1:${e2eClientPort}`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        DEMO_SERVER_PORT: String(e2eServerPort),
        NODE_ENV: 'test',
      },
    },
  ],
});
