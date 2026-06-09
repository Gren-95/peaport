import { ok, parseBody, withAuth } from '@/lib/api';
import { volumes } from '@/lib/resources';
import { createVolumeSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => ok(await volumes.list()));

export const POST = withAuth(
  async ({ req }) => {
    const body = await parseBody(req, createVolumeSchema);
    const created = await volumes.create({ Name: body.name, Driver: body.driver, Labels: body.labels });
    return ok(created, { status: 201 });
  },
  { role: 'operator' },
);
