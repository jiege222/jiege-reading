import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.resolve('.cache/browsers');
const systemChrome = process.platform === 'win32' ? [
  path.join(process.env.PROGRAMFILES ?? 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
  path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:/Program Files (x86)', 'Google/Chrome/Application/chrome.exe'),
].find(file => existsSync(file)) : undefined;
export const chromiumLaunch = { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? (!existsSync(chromium.executablePath()) ? systemChrome : undefined) };

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: true,
  workers: 3,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' } },
  ],
  webServer: { command: 'npm.cmd run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
