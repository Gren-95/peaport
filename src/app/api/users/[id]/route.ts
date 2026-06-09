import { ApiException, ok, parseBody, withAuth } from '@/lib/api';
import { checkPasswordPolicy, countAdmins, deleteUser, getUserById, updateUser } from '@/lib/auth';
import { updateUserSchema } from '@/lib/validation';
import type { Role } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseId(params: Record<string, string>): number {
  const id = Number.parseInt(params.id ?? '', 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiException('INVALID_FORMAT', 'Invalid user id.', 400);
  }
  return id;
}

export const PATCH = withAuth(
  async ({ req, params }) => {
    const id = parseId(params);
    const target = getUserById(id);
    if (!target) throw new ApiException('NOT_FOUND', 'User not found.', 404);

    const body = await parseBody(req, updateUserSchema);

    if (body.password !== undefined) {
      const policy = checkPasswordPolicy(body.password);
      if (!policy.ok) throw new ApiException('VALIDATION_ERROR', policy.message!, 422);
    }

    // Do not allow demoting the last remaining admin.
    if (body.role !== undefined && target.role === 'admin' && body.role !== 'admin' && countAdmins() <= 1) {
      throw new ApiException('CONFLICT', 'Cannot demote the last admin.', 409);
    }

    const updated = await updateUser(id, { role: body.role as Role | undefined, password: body.password });
    return ok({ user: updated });
  },
  { role: 'admin' },
);

export const DELETE = withAuth(
  async ({ params, user }) => {
    const id = parseId(params);
    const target = getUserById(id);
    if (!target) throw new ApiException('NOT_FOUND', 'User not found.', 404);

    if (target.role === 'admin' && countAdmins() <= 1) {
      throw new ApiException('CONFLICT', 'Cannot delete the last admin.', 409);
    }
    if (target.id === user.id) {
      throw new ApiException('CONFLICT', 'You cannot delete your own account.', 409);
    }

    deleteUser(id);
    return ok({ deleted: true });
  },
  { role: 'admin' },
);
