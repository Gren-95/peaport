import { ok, withAuth } from '@/lib/api';
import { containers } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ params }) => {
  const data = await containers.inspect(params.id!);
  return ok(data);
});

export const DELETE = withAuth(
  async ({ params, req }) => {
    const force = req.nextUrl.searchParams.get('force') === 'true';
    const volumes = req.nextUrl.searchParams.get('volumes') === 'true';
    await containers.remove(params.id!, force, volumes);
    return ok({ removed: true });
  },
  { role: 'admin' },
);
