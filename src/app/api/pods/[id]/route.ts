import { ok, withAuth } from '@/lib/api';
import { pods } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ params }) => ok(await pods.inspect(params.id!)));

export const DELETE = withAuth(
  async ({ params, req }) => {
    const force = req.nextUrl.searchParams.get('force') === 'true';
    await pods.remove(params.id!, force);
    return ok({ removed: true });
  },
  { role: 'admin' },
);
