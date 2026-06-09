/** Role hierarchy and authorization check (kept free of framework imports). */
import type { Role, SessionUser } from '@/types';

export const ROLE_RANK: Record<Role, number> = { viewer: 1, operator: 2, admin: 3 };

export function hasRole(user: Pick<SessionUser, 'role'>, required: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[required];
}
