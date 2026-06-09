// Capture README screenshots by driving a running Peaport instance with a real
// browser. Start a seeded server first (see the npm-less invocation in the
// README contributor notes), then: node scripts/screenshots.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SHOT_BASE || 'http://127.0.0.1:3200';
const INITIAL = process.env.SHOT_INITIAL_PW || 'shots-bootstrap-pw-1';
const NEW = process.env.SHOT_NEW_PW || 'shots-new-strong-pw-9';
const OUT = 'docs/img';
mkdirSync(OUT, { recursive: true });

const pages = [
  ['dashboard', '/dashboard'],
  ['containers', '/containers'],
  ['stacks', '/stacks'],
  ['images', '/images'],
  ['events', '/events'],
];

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  // Login + forced first-login password change.
  await page.goto(`${BASE}/login`);
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill(INITIAL);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/change-password/);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill(INITIAL);
  await pw.nth(1).fill(NEW);
  await pw.nth(2).fill(NEW);
  await page.getByRole('button', { name: /Update password/ }).click();
  await page.waitForURL(/\/dashboard/);

  for (const [name, path] of pages) {
    await page.goto(`${BASE}${path}`);
    await page.waitForTimeout(2500); // let live data / SSE populate
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log('captured', name);
  }

  // Mobile dashboard (drawer-style layout).
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const mpage = await mobile.newPage();
  await mpage.goto(`${BASE}/login`);
  await mpage.locator('#username').fill('admin');
  await mpage.locator('#password').fill(NEW);
  await mpage.getByRole('button', { name: 'Sign in' }).click();
  await mpage.waitForURL(/\/dashboard/);
  await mpage.waitForTimeout(2000);
  await mpage.screenshot({ path: `${OUT}/mobile-dashboard.png`, fullPage: true });
  console.log('captured mobile-dashboard');

  await browser.close();
};
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
