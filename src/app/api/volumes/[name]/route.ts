import { ok, withAuth } from '@/lib/api';
import { volumes } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ params }) => ok(await volumes.inspect(params.name!)));

export const DELETE = withAuth(
  async ({ params, req }) => {
    const force = req.nextUrl.searchParams.get('force') === 'true';
    await volumes.remove(params.name!, force);
    return ok({ removed: true });
  },
  { role: 'admin' },
);
