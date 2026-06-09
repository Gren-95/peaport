/**
 * Centralised, validated environment configuration.
 * Imported once and reused; fails fast on misconfiguration in production.
 */
import path from 'node:path';

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1' || value === 'yes';
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const isProd = process.env.NODE_ENV === 'production';
// `next build` evaluates module-level code with NODE_ENV=production but without
// runtime secrets present. Only enforce the secret requirement at runtime.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';

const sessionSecret = process.env.SESSION_SECRET ?? '';
if (isProd && !isBuildPhase && (!sessionSecret || sessionSecret.length < 32)) {
  throw new Error(
    'SESSION_SECRET must be set to at least 32 characters in production. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  );
}

const dataDir = path.resolve(process.env.DATA_DIR ?? './data');

export const env = {
  isProd,
  socketPath: process.env.PODMAN_SOCKET_PATH ?? '/run/podman/podman.sock',
  sessionSecret: sessionSecret || 'insecure-development-secret-do-not-use-in-production',
  // Dedicated key for encrypting stored secrets. If unset, one is derived from
  // SESSION_SECRET (rotating SESSION_SECRET then makes stored secrets
  // undecryptable — set SECRETS_KEY explicitly to decouple them).
  secretsKey: process.env.SECRETS_KEY ?? '',
  dataDir,
  dbPath: path.join(dataDir, 'panel.db'),
  stacksDir: path.join(dataDir, 'stacks'),
  // Compose CLI invocation. Empty = auto-detect ("docker compose" on Docker,
  // "podman compose" on Podman). Override with e.g. COMPOSE_COMMAND="docker-compose".
  composeCommand: process.env.COMPOSE_COMMAND ?? '',
  port: int(process.env.PORT, 3000),
  admin: {
    username: process.env.ADMIN_USERNAME ?? 'admin',
    password: process.env.ADMIN_PASSWORD ?? 'changeme',
  },
  session: {
    idleTimeout: int(process.env.SESSION_IDLE_TIMEOUT, 1800),
    absoluteTimeout: int(process.env.SESSION_ABSOLUTE_TIMEOUT, 43200),
  },
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
} as const;

export type Env = typeof env;
