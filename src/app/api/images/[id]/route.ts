import { ok, withAuth } from '@/lib/api';
import { images } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async ({ params }) => {
  const data = await images.inspect(params.id!);
  return ok(data);
});

export const DELETE = withAuth(
  async ({ params, req }) => {
    const force = req.nextUrl.searchParams.get('force') === 'true';
    const result = await images.remove(params.id!, force);
    return ok(result);
  },
  { role: 'admin' },
);
