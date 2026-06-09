import { ok, withAuth } from '@/lib/api';
import { volumes } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async () => ok(await volumes.prune()), { role: 'operator' });
