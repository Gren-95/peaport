import { ok, withAuth } from '@/lib/api';
import { containers } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const list = await containers.list(true);
  return ok({ containers: list });
});
