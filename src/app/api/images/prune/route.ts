import { ok, withAuth } from '@/lib/api';
import { images } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async () => ok(await images.prune()), { role: 'operator' });
