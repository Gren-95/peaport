import { NextResponse } from 'next/server';
import { ApiException, fail, withAuth } from '@/lib/api';
import { getStack, isStackAction, runCompose } from '@/lib/compose';
import { hasRole } from '@/lib/api';
import { sseHeaders, streamToSse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(
  async ({ params, req, user }) => {
    const name = params.name!;
    const action = params.action!;
    if (!getStack(name)) throw new ApiException('NOT_FOUND', 'Stack not found.', 404);
    if (!isStackAction(action)) {
      throw new ApiException('INVALID_FORMAT', `Unsupported stack action: ${action}`, 400);
    }

    const removeVolumes = req.nextUrl.searchParams.get('volumes') === 'true';
    // Removing volumes is destructive; require admin for that specific case.
    if (action === 'down' && removeVolumes && !hasRole(user, 'admin')) {
      return fail({ code: 'AUTH_FORBIDDEN', message: 'Removing volumes requires the admin role.' }, 403);
    }

    const { stream, kill } = await runCompose(name, action, { removeVolumes });
    req.signal.addEventListener('abort', kill);

    // Forward each output line as an SSE message.
    const transform = (chunk: Buffer): string[] =>
      chunk
        .toString('utf8')
        .split(/\r?\n/)
        .filter((l) => l.length > 0);

    return new NextResponse(streamToSse(stream, { transform, signal: req.signal }), { headers: sseHeaders() });
  },
  { role: 'operator' },
);
