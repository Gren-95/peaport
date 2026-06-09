/**
 * Compose "stacks": persistence, working-directory management, and streaming
 * execution of the Compose CLI against the engine socket.
 *
 * A stack's compose file is stored in SQLite and mirrored to disk at
 * `<dataDir>/stacks/<name>/compose.yaml`. The Compose CLI is invoked with an
 * explicit args array (never a shell string), and DOCKER_HOST points it at the
 * configured engine socket — so the same `docker compose` binary drives either
 * Docker or Podman's Docker-compatible API.
 */
import { spawn } from 'node:child_process';
import { PassThrough } from 'node:stream';
import fs from 'node:fs';
import path from 'node:path';
import { getDb, type StackRow } from '@/lib/db';
import { env } from '@/lib/env';
import { detectEngine } from '@/lib/podman';
import { decryptedSecretEnv } from '@/lib/secrets';
import type { Stack } from '@/types';

export type StackAction = 'up' | 'down' | 'stop' | 'start' | 'restart' | 'pull';

const ACTION_ARGS: Record<StackAction, string[]> = {
  up: ['up', '-d', '--remove-orphans'],
  down: ['down', '--remove-orphans'],
  stop: ['stop'],
  start: ['start'],
  restart: ['restart'],
  pull: ['pull'],
};

export function isStackAction(value: string): value is StackAction {
  return value in ACTION_ARGS;
}

// --- persistence ------------------------------------------------------------

function rowToStack(row: StackRow): Stack {
  return {
    name: row.name,
    content: row.content,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listStacks(): Stack[] {
  const rows = getDb().prepare('SELECT * FROM stacks ORDER BY name').all() as StackRow[];
  return rows.map(rowToStack);
}

export function getStack(name: string): Stack | null {
  const row = getDb().prepare('SELECT * FROM stacks WHERE name = ?').get(name) as StackRow | undefined;
  return row ? rowToStack(row) : null;
}

export function saveStack(name: string, content: string, createdBy: string | null): Stack {
  const now = Date.now();
  const existing = getStack(name);
  if (existing) {
    getDb().prepare('UPDATE stacks SET content = ?, updated_at = ? WHERE name = ?').run(content, now, name);
  } else {
    getDb()
      .prepare('INSERT INTO stacks (name, content, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, content, createdBy, now, now);
  }
  writeStackFile(name, content);
  return getStack(name)!;
}

export function deleteStack(name: string): void {
  getDb().prepare('DELETE FROM stacks WHERE name = ?').run(name);
  fs.rmSync(stackDir(name), { recursive: true, force: true });
}

// --- working directory ------------------------------------------------------

export function stackDir(name: string): string {
  return path.join(env.stacksDir, name);
}

function composeFilePath(name: string): string {
  return path.join(stackDir(name), 'compose.yaml');
}

export function writeStackFile(name: string, content: string): void {
  const dir = stackDir(name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(composeFilePath(name), content, 'utf8');
}

// --- CLI execution ----------------------------------------------------------

async function resolveComposeCommand(): Promise<{ cmd: string; baseArgs: string[] }> {
  if (env.composeCommand.trim()) {
    const parts = env.composeCommand.trim().split(/\s+/);
    return { cmd: parts[0]!, baseArgs: parts.slice(1) };
  }
  // `docker compose` (v2) speaks the Docker API and works against Podman's
  // compatible socket too via DOCKER_HOST, so it is the default for both.
  await detectEngine().catch(() => 'docker');
  return { cmd: 'docker', baseArgs: ['compose'] };
}

export interface ComposeRun {
  /** Combined stdout+stderr as a single readable stream of bytes. */
  stream: PassThrough;
  /** Terminate the underlying process (e.g. on client disconnect). */
  kill: () => void;
}

/**
 * Run a Compose action for a stack, returning a merged output stream. The
 * compose file is (re)written from the stored content before running.
 */
export async function runCompose(name: string, action: StackAction, options: { removeVolumes?: boolean } = {}): Promise<ComposeRun> {
  const stack = getStack(name);
  if (!stack) throw new Error(`Stack "${name}" not found`);
  writeStackFile(name, stack.content);

  const { cmd, baseArgs } = await resolveComposeCommand();
  const extra = [...ACTION_ARGS[action]];
  if (action === 'down' && options.removeVolumes) extra.push('--volumes');

  const args = [...baseArgs, '-p', name, '-f', composeFilePath(name), ...extra];
  // Stored secrets are decrypted here and exposed to Compose for ${VAR}
  // interpolation. They live only in this child process's environment.
  const child = spawn(cmd, args, {
    cwd: stackDir(name),
    env: {
      ...process.env,
      ...decryptedSecretEnv(),
      DOCKER_HOST: `unix://${env.socketPath}`,
      COMPOSE_PROJECT_NAME: name,
    },
  });

  const stream = new PassThrough();
  stream.write(`$ ${cmd} ${baseArgs.join(' ')} -p ${name} ${extra.join(' ')}\n`);
  child.stdout.pipe(stream, { end: false });
  child.stderr.pipe(stream, { end: false });
  child.on('error', (err) => {
    stream.write(`\n[failed to start compose: ${err.message}]\n`);
    stream.end();
  });
  child.on('close', (code) => {
    stream.write(`\n[compose ${action} exited with code ${code}]\n`);
    stream.end();
  });

  return { stream, kill: () => child.kill('SIGTERM') };
}

/** Run a Compose action and resolve once it completes (no streaming). */
export async function runComposeWait(
  name: string,
  action: StackAction,
  options: { removeVolumes?: boolean } = {},
): Promise<{ code: number | null; output: string }> {
  const { stream } = await runCompose(name, action, options);
  return new Promise((resolve) => {
    let output = '';
    let code: number | null = 0;
    stream.on('data', (c: Buffer) => {
      output += c.toString('utf8');
      const m = output.match(/\[compose \w+ exited with code (-?\d+)\]/);
      if (m) code = Number(m[1]);
    });
    stream.on('end', () => resolve({ code, output }));
  });
}
