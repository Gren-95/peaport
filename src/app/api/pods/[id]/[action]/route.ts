import { ApiException, ok, withAuth } from '@/lib/api';
import { isPodAction, pods } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  async ({ params }) => {
    const action = params.action!;
    if (!isPodAction(action)) {
      throw new ApiException('INVALID_FORMAT', `Unsupported pod action: ${action}`, 400);
    }
    await pods.action(params.id!, action);
    return ok({ action, applied: true });
  },
  { role: 'operator' },
);
