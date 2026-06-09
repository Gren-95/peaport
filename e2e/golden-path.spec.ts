import { test, expect } from '@playwright/test';

/**
 * Golden-path E2E: forced first-login password change, then pull → run → inspect
 * logs → remove a hello-world container, all through the real UI against the
 * live engine.
 */
const INITIAL_PW = 'e2e-bootstrap-pw-1'; // must match webServer ADMIN_PASSWORD
const NEW_PW = 'e2e-new-strong-pw-9';
const IMAGE = 'hello-world';
const NAME = 'e2e-hello';

test('login → forced change → pull → run → logs → remove', async ({ page }) => {
  // Sidebar navigation (the dashboard also has cards linking to the same pages,
  // so nav clicks are scoped to the <aside>).
  const nav = page.locator('aside');

  // 1. Login with the bootstrap credentials.
  await page.goto('/login');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill(INITIAL_PW);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // 2. Forced password change.
  await expect(page).toHaveURL(/\/change-password/);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill(INITIAL_PW); // current
  await pw.nth(1).fill(NEW_PW); // new
  await pw.nth(2).fill(NEW_PW); // confirm
  await page.getByRole('button', { name: /Update password/ }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // 3. Pull hello-world via the Images page.
  await nav.getByRole('link', { name: 'Images' }).click();
  await page.getByRole('button', { name: 'Pull image' }).click();
  await page.getByPlaceholder('docker.io/library/nginx:latest').fill(IMAGE);
  await page.getByRole('button', { name: 'Pull', exact: true }).click();
  await expect(page.getByText('✓ pull complete')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Close' }).click();

  // 4. Run a hello-world container.
  await nav.getByRole('link', { name: 'Containers' }).click();
  await page.getByRole('button', { name: 'Run container' }).click();
  await page.getByPlaceholder('nginx:alpine').fill(IMAGE);
  await page.getByPlaceholder('optional').fill(NAME);
  await page.getByRole('button', { name: /Create/ }).click();

  // 5. It appears in the list.
  const row = page.getByRole('row', { name: new RegExp(NAME) });
  await expect(row).toBeVisible({ timeout: 20_000 });

  // 6. Open it and confirm the log output streamed through.
  await page.getByRole('link', { name: NAME }).click();
  await expect(page).toHaveURL(/\/containers\//);
  await page.getByRole('button', { name: 'logs' }).click();
  await expect(page.getByText('Hello from Docker!')).toBeVisible({ timeout: 30_000 });

  // 7. Remove it from the list.
  await nav.getByRole('link', { name: 'Containers' }).click();
  const targetRow = page.getByRole('row', { name: new RegExp(NAME) });
  await targetRow.getByRole('button', { name: 'Remove' }).click();
  // The confirmation dialog's button carries visible text (the row's is icon-only).
  await page.locator('button.btn-danger', { hasText: 'Remove' }).click();
  await expect(page.getByRole('link', { name: NAME })).toHaveCount(0, { timeout: 20_000 });
});
