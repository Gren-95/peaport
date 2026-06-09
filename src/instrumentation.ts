/**
 * Runs once when the server process starts. Used to create the bootstrap admin
 * account on first launch. Only executes in the Node.js runtime (the database
 * driver is native and unavailable on the edge runtime).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { bootstrapAdmin } = await import('@/lib/auth');
  try {
    await bootstrapAdmin();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[panel] Failed to bootstrap admin user:', err);
  }
}
