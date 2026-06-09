import { ok, withAuth } from '@/lib/api';
import { images } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  async ({ req }) => {
    const all = req.nextUrl.searchParams.get('all') === 'true';
    const until = req.nextUrl.searchParams.get('until') || undefined;
    const result = await images.prune({ all, until });
    const deleted = result?.ImagesDeleted?.length ?? 0;
    return ok({ deleted, spaceReclaimed: result?.SpaceReclaimed ?? 0, result });
  },
  { role: 'operator' },
);
