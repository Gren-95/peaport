import { ok, withAuth } from '@/lib/api';
import { destroyOtherUserSessions, listUserSessions } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Session identifiers are secrets (they are the auth token) and are never sent
// to the client — only non-sensitive metadata, with the current one flagged.
export const GET = withAuth(async ({ user, session }) => {
  const sessions = listUserSessions(user.id).map((s) => ({
    createdAt: s.created_at,
    lastSeenAt: s.last_seen_at,
    expiresAt: s.expires_at,
    ip: s.ip,
    userAgent: s.user_agent,
    current: s.id === session.id,
  }));
  return ok({ sessions });
});

// Revoke every other session for this user, keeping the current one.
export const DELETE = withAuth(async ({ user, session }) => {
  const revoked = destroyOtherUserSessions(user.id, session.id);
  return ok({ revoked });
});
