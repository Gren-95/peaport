/**
 * Low-level client for the Podman REST API over a Unix domain socket.
 *
 * Podman exposes two API surfaces on the same socket:
 *   - a Docker-compatible API at unversioned paths  (e.g. /containers/json)
 *   - a Podman-native "libpod" API                  (e.g. /v4.0.0/libpod/pods/json)
 *
 * The compat endpoints work identically against a Docker socket, which lets
 * the same code run against either engine. Pod features require libpod.
 */
import http from 'node:http';
import type { Socket } from 'node:net';
import { Readable } from 'node:stream';
import { env } from '@/lib/env';

const LIBPOD_PREFIX = '/v4.0.0/libpod';

export class PodmanError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public body?: string,
  ) {
    super(message);
    this.name = 'PodmanError';
  }
}

type Query = Record<string, string | number | boolean | undefined> | undefined;

function buildPath(path: string, query: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

interface RequestOptions {
  method?: string;
  query?: Query;
  body?: unknown;
  /** Treat this path as a libpod (Podman-native) endpoint. */
  libpod?: boolean;
}

function resolvePath(path: string, libpod?: boolean): string {
  if (libpod) return `${LIBPOD_PREFIX}${path}`;
  return path;
}

/** Perform a buffered request and parse the JSON response. */
export async function podmanRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', query, body, libpod } = options;
  const payload = body !== undefined ? JSON.stringify(body) : undefined;

  return new Promise<T>((resolve, reject) => {
    const req = http.request(
      {
        socketPath: env.socketPath,
        path: buildPath(resolvePath(path, libpod), query),
        method,
        headers: {
          Host: 'd',
          Accept: 'application/json',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            if (!text) return resolve(undefined as T);
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              resolve(text as unknown as T);
            }
            return;
          }
          let message = `Podman API responded ${status}`;
          try {
            const parsed = JSON.parse(text) as { message?: string; cause?: string };
            if (parsed.message) message = parsed.message;
          } catch {
            if (text) message = text;
          }
          reject(new PodmanError(status, message, text));
        });
      },
    );
    req.on('error', (err) =>
      reject(new PodmanError(0, `Cannot reach Podman socket at ${env.socketPath}: ${err.message}`)),
    );
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Perform a streaming request, resolving with the raw response stream.
 * Used for log following and stats streaming.
 */
export async function podmanStream(
  path: string,
  options: RequestOptions = {},
): Promise<{ stream: Readable; statusCode: number }> {
  const { method = 'GET', query, body, libpod } = options;
  const payload = body !== undefined ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: env.socketPath,
        path: buildPath(resolvePath(path, libpod), query),
        method,
        headers: {
          Host: 'd',
          ...(payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {}),
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 400) {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () =>
            reject(new PodmanError(status, `Podman API responded ${status}`, Buffer.concat(chunks).toString('utf8'))),
          );
          return;
        }
        resolve({ stream: res, statusCode: status });
      },
    );
    req.on('error', (err) =>
      reject(new PodmanError(0, `Cannot reach Podman socket at ${env.socketPath}: ${err.message}`)),
    );
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Hijack the connection for a bidirectional attach/exec stream.
 * Returns the raw duplex socket once the engine upgrades the connection.
 */
export async function podmanHijack(
  path: string,
  options: Omit<RequestOptions, 'method'> & { method?: string } = {},
): Promise<Socket> {
  const { method = 'POST', query, body, libpod } = options;
  const payload = body !== undefined ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const req = http.request({
      socketPath: env.socketPath,
      path: buildPath(resolvePath(path, libpod), query),
      method,
      headers: {
        Host: 'd',
        'Content-Type': 'application/json',
        Connection: 'Upgrade',
        Upgrade: 'tcp',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    });

    req.on('upgrade', (_res, socket) => resolve(socket));
    // Some engine versions stream on the same connection without a formal 101.
    req.on('response', (res) => {
      if ((res.statusCode ?? 0) < 300 && res.socket) {
        resolve(res.socket as Socket);
      } else {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () =>
          reject(new PodmanError(res.statusCode ?? 0, 'Exec attach failed', Buffer.concat(chunks).toString('utf8'))),
        );
      }
    });
    req.on('error', (err) => reject(new PodmanError(0, err.message)));
    if (payload) req.write(payload);
    req.end();
  });
}

let cachedEngine: 'podman' | 'docker' | null = null;

/** Detect whether the socket is backed by Podman (libpod present) or Docker. */
export async function detectEngine(): Promise<'podman' | 'docker'> {
  if (cachedEngine) return cachedEngine;
  try {
    await podmanRequest('/info', { libpod: true });
    cachedEngine = 'podman';
  } catch {
    cachedEngine = 'docker';
  }
  return cachedEngine;
}

/**
 * Demultiplex a Docker/Podman attach stream that uses the 8-byte stream header
 * framing (used when the container has no TTY). Returns plain text.
 */
export function demuxFrame(buffer: Buffer): { text: string; rest: Buffer } {
  let text = '';
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset + 4);
    if (offset + 8 + size > buffer.length) break;
    text += buffer.subarray(offset + 8, offset + 8 + size).toString('utf8');
    offset += 8 + size;
  }
  return { text, rest: buffer.subarray(offset) };
}
