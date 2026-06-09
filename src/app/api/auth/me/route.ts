import { ok, withAuth } from '@/lib/api';
import { detectEngine } from '@/lib/podman';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ user, session }) => {
  const engine = await detectEngine().catch(() => 'docker' as const);
  return ok({ user, csrfToken: session.csrf_token, engine });
});
