import { ok, withAuth } from '@/lib/api';
import { networks } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async () => ok(await networks.prune()), { role: 'operator' });
