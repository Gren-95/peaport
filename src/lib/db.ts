/**
 * SQLite persistence for users and sessions (better-sqlite3, synchronous).
 * The connection is a process-wide singleton reused across requests.
 */
import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { Role } from '@/types';
import { env } from '@/lib/env';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  role: Role;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
  must_change_password: number;
}

export interface SessionRow {
  id: string;
  user_id: number;
  csrf_token: string;
  created_at: number;
  last_seen_at: number;
  expires_at: number;
  ip: string | null;
  user_agent: string | null;
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  fs.mkdirSync(env.dataDir, { recursive: true });
  db = new Database(env.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'viewer',
      created_at    INTEGER NOT NULL,
      updated_at    INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL,
      csrf_token   TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      expires_at   INTEGER NOT NULL,
      ip           TEXT,
      user_agent   TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS stacks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      content     TEXT NOT NULL,
      created_by  TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS secrets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      enc         TEXT NOT NULL,
      created_by  TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ts          INTEGER NOT NULL,
      username    TEXT,
      role        TEXT,
      method      TEXT NOT NULL,
      path        TEXT NOT NULL,
      action      TEXT NOT NULL,
      status      INTEGER NOT NULL,
      outcome     TEXT NOT NULL,
      ip          TEXT,
      detail      TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(username);
  `);

  // Idempotent column additions for databases created by earlier versions.
  addColumnIfMissing(database, 'users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
}

function addColumnIfMissing(database: Database.Database, table: string, column: string, def: string): void {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  }
}

export interface AuditRow {
  id: number;
  ts: number;
  username: string | null;
  role: string | null;
  method: string;
  path: string;
  action: string;
  status: number;
  outcome: string;
  ip: string | null;
  detail: string | null;
}

export interface SecretRow {
  id: number;
  name: string;
  enc: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

export interface StackRow {
  id: number;
  name: string;
  content: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
}

/** Remove expired sessions. Called opportunistically on session lookups. */
export function purgeExpiredSessions(now: number): void {
  getDb().prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}
