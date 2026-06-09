import { ApiException, ok, withAuth } from '@/lib/api';
import { deleteSecret, secretExists } from '@/lib/secrets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withAuth(
  async ({ params }) => {
    if (!secretExists(params.name!)) throw new ApiException('NOT_FOUND', 'Secret not found.', 404);
    deleteSecret(params.name!);
    return ok({ removed: true });
  },
  { role: 'operator' },
);
