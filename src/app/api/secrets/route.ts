import { ok, parseBody, withAuth } from '@/lib/api';
import { listSecretMeta, setSecret } from '@/lib/secrets';
import { setSecretSchema } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Values are never returned — only metadata. Listing is available to operators
// (who deploy stacks that reference secrets) and admins.
export const GET = withAuth(async () => ok({ secrets: listSecretMeta() }), { role: 'operator' });

export const POST = withAuth(
  async ({ req, user }) => {
    const { name, value } = await parseBody(req, setSecretSchema);
    const secret = setSecret(name, value, user.username);
    return ok({ secret }, { status: 201 });
  },
  { role: 'operator' },
);
