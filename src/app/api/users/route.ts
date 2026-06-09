import { ApiException, ok, parseBody, withAuth } from '@/lib/api';
import { checkPasswordPolicy, createUser, getUserRowByUsername, listUsers } from '@/lib/auth';
import { createUserSchema } from '@/lib/validation';
import type { Role } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async () => ok({ users: listUsers() }), { role: 'admin' });

export const POST = withAuth(
  async ({ req }) => {
    const body = await parseBody(req, createUserSchema);
    if (getUserRowByUsername(body.username)) {
      throw new ApiException('ALREADY_EXISTS', 'A user with that username already exists.', 409);
    }
    const policy = checkPasswordPolicy(body.password);
    if (!policy.ok) throw new ApiException('VALIDATION_ERROR', policy.message!, 422);

    const user = await createUser(body.username, body.password, body.role as Role);
    return ok({ user }, { status: 201 });
  },
  { role: 'admin' },
);
