/**
 * Authentication & session management: password hashing, session lifecycle
 * (idle + absolute timeouts), CSRF tokens, and the bootstrap admin account.
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb, purgeExpiredSessions, type SessionRow, type UserRow } from '@/lib/db';
import { env } from '@/lib/env';
import type { Role, SessionUser, User } from '@/types';

export const SESSION_COOKIE = 'panel_session';
export const CSRF_HEADER = 'x-csrf-token';

const BCRYPT_ROUNDS = 12;

/** A small blocklist of the most common passwords; rejected at set time. */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890', 'qwerty123',
  'changeme', 'admin123', 'letmein1', 'welcome1', 'iloveyou', 'sunshine1',
  'football1', 'monkey12', 'dragon123', 'baseball1', 'superman1', 'trustno1',
]);

function now(): number {
  return Date.now();
}

// --- password helpers -------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface PasswordPolicyResult {
  ok: boolean;
  message?: string;
}

export function checkPasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };
  if (password.length > 256) return { ok: false, message: 'Password must be at most 256 characters.' };
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { ok: false, message: 'Password is too common. Choose something less guessable.' };
  }
  return { ok: true };
}

// --- mappers ----------------------------------------------------------------

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

// --- user CRUD --------------------------------------------------------------

export function countUsers(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
  return row.n;
}

export function listUsers(): User[] {
  const rows = getDb().prepare('SELECT * FROM users ORDER BY username').all() as UserRow[];
  return rows.map(rowToUser);
}

export function getUserById(id: number): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getUserRowByUsername(username: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export async function createUser(username: string, password: string, role: Role): Promise<User> {
  const ts = now();
  const hash = await hashPassword(password);
  const info = getDb()
    .prepare(
      `INSERT INTO users (username, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(username, hash, role, ts, ts);
  return getUserById(Number(info.lastInsertRowid))!;
}

export async function updateUser(
  id: number,
  changes: { role?: Role; password?: string },
): Promise<User | null> {
  const existing = getUserById(id);
  if (!existing) return null;
  const ts = now();
  if (changes.password !== undefined) {
    const hash = await hashPassword(changes.password);
    getDb().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hash, ts, id);
    // Force re-authentication everywhere after a credential change.
    destroyUserSessions(id);
  }
  if (changes.role !== undefined) {
    getDb().prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(changes.role, ts, id);
  }
  return getUserById(id);
}

export function deleteUser(id: number): boolean {
  const info = getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  return info.changes > 0;
}

export function countAdmins(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number };
  return row.n;
}

// --- sessions ---------------------------------------------------------------

export interface ValidatedSession {
  user: SessionUser;
  session: SessionRow;
}

export function createSession(userId: number, ip: string | null, userAgent: string | null): {
  id: string;
  csrfToken: string;
} {
  const id = crypto.randomBytes(32).toString('hex'); // 256 bits of entropy
  const csrfToken = crypto.randomBytes(32).toString('hex');
  const ts = now();
  const expiresAt = ts + env.session.absoluteTimeout * 1000;
  getDb()
    .prepare(
      `INSERT INTO sessions (id, user_id, csrf_token, created_at, last_seen_at, expires_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, userId, csrfToken, ts, ts, expiresAt, ip, userAgent?.slice(0, 255) ?? null);
  getDb().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(ts, userId);
  return { id, csrfToken };
}

/**
 * Validate a session id, enforcing both idle and absolute timeouts.
 * Slides the idle window on success. Returns null for missing/expired sessions.
 */
export function validateSession(sessionId: string | undefined): ValidatedSession | null {
  if (!sessionId) return null;
  const ts = now();
  const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as SessionRow | undefined;
  if (!row) return null;

  const idleDeadline = row.last_seen_at + env.session.idleTimeout * 1000;
  if (ts > row.expires_at || ts > idleDeadline) {
    destroySession(sessionId);
    return null;
  }

  const user = getUserById(row.user_id);
  if (!user) {
    destroySession(sessionId);
    return null;
  }

  getDb().prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(ts, sessionId);
  if (Math.random() < 0.05) purgeExpiredSessions(ts); // opportunistic cleanup
  return {
    user: { id: user.id, username: user.username, role: user.role },
    session: { ...row, last_seen_at: ts },
  };
}

export function destroySession(sessionId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function destroyUserSessions(userId: number): void {
  getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function listUserSessions(userId: number): SessionRow[] {
  return getDb()
    .prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC')
    .all(userId) as SessionRow[];
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// --- bootstrap --------------------------------------------------------------

/** Create the initial admin account on first run when no users exist. */
export async function bootstrapAdmin(): Promise<void> {
  if (countUsers() > 0) return;
  const { username, password } = env.admin;
  await createUser(username, password, 'admin');
  // eslint-disable-next-line no-console
  console.log(`[panel] Bootstrapped admin user "${username}". Change the password after first login.`);
}

// Run the bootstrap at most once per process, lazily on the first auth request
// (kept out of Next instrumentation so the edge runtime never imports the
// native database driver).
let bootstrapPromise: Promise<void> | null = null;
export function ensureBootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapAdmin().catch((err) => {
      bootstrapPromise = null; // allow a retry on the next request
      throw err;
    });
  }
  return bootstrapPromise;
}
