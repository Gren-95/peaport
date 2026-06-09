/**
 * Encrypted secret store. Values are write-only over the API: they are stored
 * encrypted and never returned in plaintext to any client. They are decrypted
 * only server-side, at compose deploy time, and injected into the engine
 * process environment for `${VAR}` interpolation.
 */
import { getDb, type SecretRow } from '@/lib/db';
import { decryptSecret, encryptSecret } from '@/lib/crypto';

export interface SecretMeta {
  name: string;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  /** A short non-reversible hint (last 2 chars) to help operators tell secrets apart. */
  hint: string;
}

function toMeta(row: SecretRow): SecretMeta {
  let hint = '••';
  try {
    const value = decryptSecret(row.enc);
    hint = value.length <= 2 ? '••' : `••${value.slice(-2)}`;
  } catch {
    hint = '??';
  }
  return { name: row.name, createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at, hint };
}

export function listSecretMeta(): SecretMeta[] {
  const rows = getDb().prepare('SELECT * FROM secrets ORDER BY name').all() as SecretRow[];
  return rows.map(toMeta);
}

export function secretExists(name: string): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM secrets WHERE name = ?').get(name));
}

export function setSecret(name: string, value: string, user: string | null): SecretMeta {
  const now = Date.now();
  const enc = encryptSecret(value);
  const existing = getDb().prepare('SELECT id FROM secrets WHERE name = ?').get(name) as { id: number } | undefined;
  if (existing) {
    getDb().prepare('UPDATE secrets SET enc = ?, updated_at = ? WHERE name = ?').run(enc, now, name);
  } else {
    getDb()
      .prepare('INSERT INTO secrets (name, enc, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, enc, user, now, now);
  }
  return toMeta(getDb().prepare('SELECT * FROM secrets WHERE name = ?').get(name) as SecretRow);
}

export function deleteSecret(name: string): boolean {
  return getDb().prepare('DELETE FROM secrets WHERE name = ?').run(name).changes > 0;
}

/** Decrypt all secrets into a plain env map. Server-side use only. */
export function decryptedSecretEnv(): Record<string, string> {
  const rows = getDb().prepare('SELECT name, enc FROM secrets').all() as Pick<SecretRow, 'name' | 'enc'>[];
  const out: Record<string, string> = {};
  for (const row of rows) {
    try {
      out[row.name] = decryptSecret(row.enc);
    } catch {
      // Skip secrets that fail to decrypt (e.g. key rotated) rather than abort.
    }
  }
  return out;
}
