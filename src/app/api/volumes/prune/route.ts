import { ok, withAuth } from '@/lib/api';
import { volumes } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  async ({ req }) => {
    const all = req.nextUrl.searchParams.get('all') === 'true';
    const label = req.nextUrl.searchParams.get('label') || undefined;
    const result = await volumes.prune({ all, label });
    return ok({
      deleted: result?.VolumesDeleted?.length ?? 0,
      spaceReclaimed: result?.SpaceReclaimed ?? 0,
      result,
    });
  },
  { role: 'operator' },
);
