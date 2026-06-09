import { ok, withAuth } from '@/lib/api';
import { images } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => {
  const list = await images.list();
  return ok({ images: list });
});
