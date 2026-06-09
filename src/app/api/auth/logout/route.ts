import { ok, withAuth } from '@/lib/api';
import { destroySession } from '@/lib/auth';
import { clearedSessionCookie } from '@/lib/net';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ session }) => {
  destroySession(session.id);
  const res = ok({ loggedOut: true });
  res.cookies.set(clearedSessionCookie());
  return res;
});
