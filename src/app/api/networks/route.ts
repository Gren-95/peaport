import { ok, parseBody, withAuth } from '@/lib/api';
import { networks } from '@/lib/resources';
import { createNetworkSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => ok({ networks: await networks.list() }));

export const POST = withAuth(
  async ({ req }) => {
    const body = await parseBody(req, createNetworkSchema);
    const created = await networks.create({ Name: body.name, Driver: body.driver, Internal: body.internal });
    return ok(created, { status: 201 });
  },
  { role: 'operator' },
);
