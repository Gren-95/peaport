import { ApiException, ok, parseBody, withAuth } from '@/lib/api';
import {
  checkPasswordPolicy,
  createSession,
  getUserRowByUsername,
  updateUser,
  verifyPassword,
} from '@/lib/auth';
import { changeOwnPasswordSchema } from '@/lib/validation';
import { clientIp, sessionCookie } from '@/lib/net';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async ({ user, req }) => {
  const { currentPassword, newPassword } = await parseBody(req, changeOwnPasswordSchema);

  const row = getUserRowByUsername(user.username);
  if (!row || !(await verifyPassword(currentPassword, row.password_hash))) {
    throw new ApiException('AUTH_INVALID', 'Current password is incorrect.', 401);
  }

  const policy = checkPasswordPolicy(newPassword);
  if (!policy.ok) throw new ApiException('VALIDATION_ERROR', policy.message!, 422);

  // updateUser revokes all existing sessions; issue a fresh one for this client.
  await updateUser(user.id, { password: newPassword });
  const { id, csrfToken } = createSession(user.id, clientIp(req), req.headers.get('user-agent'));

  const res = ok({ csrfToken });
  res.cookies.set(sessionCookie(id));
  return res;
});
