import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.ts',
  timeout: 20_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: "cp test/support/chapter-mock-backend.ts test/support/.chapter-mock-ci.ts && sed -i 's/now + 180/now + 1500/g; s/}, 180);/}, 1500);/g' test/support/.chapter-mock-ci.ts && npx tsx test/support/.chapter-mock-ci.ts",
      port: 8787,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
    {
      command: 'npm run preview -- --host 127.0.0.1 --port 4173',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
  ],
});
