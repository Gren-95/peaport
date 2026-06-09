import { ApiException, ok, withAuth } from '@/lib/api';
import { containers, isContainerAction } from '@/lib/resources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  async ({ params }) => {
    const action = params.action!;
    if (!isContainerAction(action)) {
      throw new ApiException('INVALID_FORMAT', `Unsupported container action: ${action}`, 400);
    }
    await containers.action(params.id!, action);
    return ok({ action, applied: true });
  },
  { role: 'operator' },
);
