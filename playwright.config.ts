import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Boots the production build of the panel on a dedicated port with
 * a throwaway data directory pointed at the local Docker socket, then drives it
 * with a real browser. Requires `next build` to have run (the test:e2e script
 * does this) and a reachable engine socket.
 */
const PORT = 3100;
const SECRET = 'e2e-only-session-secret-0123456789abcdef0123456789abcdef';

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}/login`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: '127.0.0.1',
      DATA_DIR: './.e2e-data',
      SESSION_SECRET: SECRET,
      SECRETS_KEY: SECRET,
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'e2e-bootstrap-pw-1',
      PODMAN_SOCKET_PATH: process.env.PODMAN_SOCKET_PATH ?? '/var/run/docker.sock',
      COOKIE_SECURE: 'false',
    },
  },
});
