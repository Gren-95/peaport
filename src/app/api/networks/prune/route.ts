import { ok, withAuth } from '@/lib/api';
import { networks } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  async ({ req }) => {
    const until = req.nextUrl.searchParams.get('until') || undefined;
    const label = req.nextUrl.searchParams.get('label') || undefined;
    const result = await networks.prune({ until, label });
    return ok({ deleted: result?.NetworksDeleted?.length ?? 0, result });
  },
  { role: 'operator' },
);
