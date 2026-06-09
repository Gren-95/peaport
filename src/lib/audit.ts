/**
 * Append-only audit log of state-changing actions. Entries are written
 * automatically by the auth wrapper for every mutating request, plus explicit
 * auth events (login success/failure, logout).
 */
import { getDb, type AuditRow } from '@/lib/db';

export interface AuditEntry {
  username: string | null;
  role: string | null;
  method: string;
  path: string;
  status: number;
  ip: string | null;
  detail?: string | null;
}

/** Turn a method + path into a concise human-readable action label. */
export function describeAction(method: string, path: string): string {
  const p = path.replace(/^\/api\//, '');
  const seg = p.split('?')[0]!.split('/');
  const tail = seg[seg.length - 1];

  if (p.startsWith('auth/login')) return 'login';
  if (p.startsWith('auth/logout')) return 'logout';
  if (p.startsWith('account/password')) return 'change own password';

  if (seg[0] === 'containers') {
    if (tail === 'create') return 'create container';
    if (method === 'DELETE') return 'remove container';
    if (seg.length === 3) return `container ${tail}`; // start/stop/restart/...
  }
  if (seg[0] === 'images') {
    if (tail === 'pull') return 'pull image';
    if (tail === 'prune') return 'prune images';
    if (method === 'DELETE') return 'remove image';
  }
  if (seg[0] === 'volumes') {
    if (tail === 'prune') return 'prune volumes';
    if (method === 'POST') return 'create volume';
    if (method === 'DELETE') return 'remove volume';
  }
  if (seg[0] === 'networks') {
    if (tail === 'prune') return 'prune networks';
    if (method === 'POST') return 'create network';
    if (method === 'DELETE') return 'remove network';
  }
  if (seg[0] === 'pods') {
    if (method === 'DELETE') return 'remove pod';
    if (seg.length === 3) return `pod ${tail}`;
  }
  if (seg[0] === 'stacks') {
    if (method === 'POST' && seg.length === 1) return 'create stack';
    if (method === 'PUT') return 'edit stack';
    if (method === 'DELETE') return 'delete stack';
    if (seg.length === 3) return `stack ${tail}`;
  }
  if (seg[0] === 'secrets') {
    if (method === 'POST') return 'set secret';
    if (method === 'DELETE') return 'delete secret';
  }
  if (seg[0] === 'users') {
    if (method === 'POST') return 'create user';
    if (method === 'PATCH') return 'update user';
    if (method === 'DELETE') return 'delete user';
  }
  return `${method} ${p}`;
}

export function recordAudit(entry: AuditEntry): void {
  const ts = Date.now();
  const action = describeAction(entry.method, entry.path);
  const outcome = entry.status < 400 ? 'success' : 'failure';

  // Mirror to stdout as a structured line so an external log collector can ship
  // audit events to an isolated store, independent of the application database.
  try {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ts: new Date(ts).toISOString(),
        level: outcome === 'success' ? 'info' : 'warn',
        kind: 'audit',
        user: entry.username,
        role: entry.role,
        action,
        method: entry.method,
        path: entry.path,
        status: entry.status,
        outcome,
        ip: entry.ip,
      }),
    );
  } catch {
    /* ignore */
  }

  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log (ts, username, role, method, path, action, status, outcome, ip, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(ts, entry.username, entry.role, entry.method, entry.path, action, entry.status, outcome, entry.ip, entry.detail ?? null);
  } catch {
    // Never let audit logging break the request it is recording.
  }
}

export interface AuditQuery {
  limit: number;
  offset: number;
  username?: string;
  outcome?: 'success' | 'failure';
}

export function listAudit(query: AuditQuery): { entries: AuditRow[]; total: number } {
  const where: string[] = [];
  const args: unknown[] = [];
  if (query.username) {
    where.push('username = ?');
    args.push(query.username);
  }
  if (query.outcome) {
    where.push('outcome = ?');
    args.push(query.outcome);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (getDb().prepare(`SELECT COUNT(*) AS n FROM audit_log ${clause}`).get(...args) as { n: number }).n;
  const entries = getDb()
    .prepare(`SELECT * FROM audit_log ${clause} ORDER BY ts DESC LIMIT ? OFFSET ?`)
    .all(...args, query.limit, query.offset) as AuditRow[];
  return { entries, total };
}
