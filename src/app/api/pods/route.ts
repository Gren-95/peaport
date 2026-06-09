import { ok, withAuth } from '@/lib/api';
import { pods } from '@/lib/resources';
import { PodmanError } from '@/lib/podman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  try {
    const list = await pods.list();
    return ok({ supported: true, pods: list });
  } catch (err) {
    // Docker has no libpod API; report pods as unsupported rather than erroring.
    if (err instanceof PodmanError && (err.statusCode === 404 || err.statusCode === 400)) {
      return ok({ supported: false, pods: [] });
    }
    throw err;
  }
});
