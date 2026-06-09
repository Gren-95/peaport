import { ok, withAuth } from '@/lib/api';
import { listAudit } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async ({ req }) => {
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(200, Math.max(1, Number.parseInt(sp.get('limit') ?? '100', 10) || 100));
    const offset = Math.max(0, Number.parseInt(sp.get('offset') ?? '0', 10) || 0);
    const username = sp.get('username') || undefined;
    const outcomeParam = sp.get('outcome');
    const outcome = outcomeParam === 'success' || outcomeParam === 'failure' ? outcomeParam : undefined;

    const { entries, total } = listAudit({ limit, offset, username, outcome });
    return ok({ entries, total, limit, offset });
  },
  { role: 'admin' },
);
