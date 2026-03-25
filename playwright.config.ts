import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * Playwright configuration for the Chatbot Testing Framework.
 *
 * Key design decisions:
 * - Parallel workers limited to 2 to avoid overwhelming the hosted chatbot API
 * - Generous timeouts to account for AI response latency (up to 30s per response)
 * - Full trace + screenshots captured on failure for debugging
 * - Separate projects allow targeting specific test categories in CI
 */
export default defineConfig({
  // Root directory for all test files
  testDir: './tests',

  // File naming pattern — all .spec.ts files under /tests
  testMatch: '**/*.spec.ts',

  // Global timeout per individual test.
  // 90s accounts for: domcontentloaded (5s) + React hydration (3s) +
  // dynamic import (3s) + iframe poll (12s) + bot response (30s) + buffer.
  timeout: 90_000,

  // Timeout for each assertion (10s)
  expect: {
    timeout: 10_000,
  },

  // Run tests in parallel; limit to 2 to be polite to the hosted chatbot service
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,

  // Retry failed tests — AI responses can be flaky due to network/latency
  retries: process.env.CI ? 2 : 1,

  // Reporter configuration
  reporter: [
    // Terminal output
    ['list'],
    // Playwright's built-in HTML report
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    // Our custom chatbot quality reporter
    ['./reporters/ChatbotReporter.ts', {
      outputDir: 'chatbot-reports',
      reportName: `chatbot-quality-${new Date().toISOString().split('T')[0]}`,
    }],
    // JSON output for CI artifact consumption
    ['json', { outputFile: 'chatbot-reports/results.json' }],
  ],

  // Shared settings across all projects
  use: {
    // Base URL of the Next.js app under test
    baseURL: process.env.APP_BASE_URL || 'http://localhost:3000',

    // Capture screenshot only on test failure
    screenshot: 'only-on-failure',

    // Collect full trace on first retry (invaluable for debugging flaky tests)
    trace: 'on-first-retry',

    // Record video on first retry
    video: 'on-first-retry',

    // Action timeout — time to wait for individual Playwright actions
    actionTimeout: 15_000,

    // Navigation timeout — generous for ChatBot.com CDN load
    navigationTimeout: 45_000,

    // Ignore HTTPS errors (useful for local/staging environments)
    ignoreHTTPSErrors: true,

    // Viewport consistent with typical user
    viewport: { width: 1280, height: 720 },

    // ── CRITICAL: Use a real browser user-agent ───────────────────────────────
    // ChatBot.com's CDN detects and blocks headless UA strings like
    // "HeadlessChrome". This UA string passes their bot-detection checks.
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36',

    // ── CRITICAL: Do NOT send headers that signal automation ─────────────────
    // The previous 'x-test-automation' header was causing ChatBot.com's WAF
    // to block widget loading. Leave extraHTTPHeaders empty.
    extraHTTPHeaders: {},

    // ── CRITICAL: Launch args to allow cross-origin iframe content ────────────
    // ChatBot.com iframes load scripts from chatbot.com origin inside your
    // localhost page. Without --disable-web-security, Chromium may block
    // cross-origin iframe content in headless mode.
    launchOptions: {
      args: [
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--allow-running-insecure-content',
        // Prevent bot-detection via automation flags
        '--disable-blink-features=AutomationControlled',
        // Allow third-party cookies (ChatBot.com session tracking)
        '--disable-features=BlockThirdPartyCookies',
      ],
    },

    // ── CRITICAL: Bypass Content Security Policy ──────────────────────────────
    // Your Next.js app's next.config.js may set CSP headers that block
    // chatbot.com scripts from loading inside iframes. bypassCSP overrides
    // those headers at the browser level so the widget can initialize.
    bypassCSP: true,
  },

  // Output directory for test artifacts
  outputDir: 'test-artifacts',

  // Test projects — each project can run a subset of tests
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
      },
    },
    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox'],
      },
      // Only run UI + conversation tests on Firefox (not latency/regression)
      testMatch: ['**/ui/**', '**/conversation/**'],
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
      },
      // Mobile layout tests — widget must be accessible on mobile
      testMatch: ['**/ui/**'],
    },
    {
      name: 'safety-suite',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: ['**/safety/**'],
      // Safety tests never retry — a failure is a real failure
      retries: 0,
    },
    {
      name: 'latency-suite',
      use: {
        ...devices['Desktop Chrome'],
      },
      testMatch: ['**/latency/**'],
      // Run latency tests sequentially — parallel execution skews measurements
      workers: 1,
    },
  ],

  // ── webServer: auto-start the Next.js dev server ───────────────────────────
  //
  // When APP_BASE_URL is localhost (i.e. you're not pointing at a remote staging
  // env), Playwright will:
  //   1. Run `npm run dev` in the Next.js app directory
  //   2. Wait until http://localhost:3000 responds before starting tests
  //   3. Shut it down cleanly after the run
  //
  // Set NEXTJS_APP_DIR in .env to the path of your Next.js app.
  // If you're already running the dev server manually, set
  // PLAYWRIGHT_SKIP_WEBSERVER=true to skip this block.
  //
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER !== 'true' && process.env.NEXTJS_APP_DIR
    ? {
        webServer: {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          cwd: process.env.NEXTJS_APP_DIR,
          reuseExistingServer: true, // If already running, just reuse it
          timeout: 120_000,          // Next.js dev cold-start can be slow
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }
    : {}),

  // Global setup — runs once before all tests (e.g., verify app is up)
  globalSetup: './config/global-setup.ts',

  // Global teardown — runs once after all tests
  globalTeardown: './config/global-teardown.ts',
});
