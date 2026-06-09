import { ok, withAuth } from '@/lib/api';
import { networks } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ params }) => ok(await networks.inspect(params.id!)));

export const DELETE = withAuth(
  async ({ params }) => {
    await networks.remove(params.id!);
    return ok({ removed: true });
  },
  { role: 'admin' },
);
