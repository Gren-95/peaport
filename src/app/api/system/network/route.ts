import { ok, withAuth } from '@/lib/api';
import { listAdapters } from '@/lib/network';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => ok(await listAdapters()));
