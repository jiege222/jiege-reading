import { defineConfig } from '@playwright/test';
import base, { chromiumLaunch } from './playwright.config';

export default defineConfig({
  ...base,
  testDir: './tests/stress',
  outputDir: 'test-results/stress',
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  projects: [{ name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, launchOptions: chromiumLaunch } }],
});
