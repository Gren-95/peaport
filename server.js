/**
 * Custom Next.js server.
 *
 * Next route handlers serve the REST API and the SPA. This server adds a raw
 * WebSocket endpoint (`/ws/exec`) for interactive container exec, which the
 * App Router cannot express on its own.
 *
 * Authentication for the WebSocket is delegated to the existing `/api/auth/me`
 * endpoint (the upgrade request's cookies are forwarded), so there is no
 * duplicated session logic here.
 */
const http = require('node:http');
const next = require('next');
const { WebSocketServer } = require('ws');

const dev = process.env.NODE_ENV !== 'production';

// Load .env / .env.local before reading any configuration below, matching how
// Next loads environment variables internally.
require('@next/env').loadEnvConfig(process.cwd(), dev);

const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOSTNAME || '0.0.0.0';
const socketPath = process.env.PODMAN_SOCKET_PATH || '/run/podman/podman.sock';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// --- engine helpers (plain Node http over the Unix socket) ------------------

function enginePost(path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        socketPath,
        path,
        method: 'POST',
        headers: {
          Host: 'd',
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode || 0) >= 400) return reject(new Error(`engine ${res.statusCode}: ${text}`));
          try {
            resolve(text ? JSON.parse(text) : {});
          } catch {
            resolve({});
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Hijack the connection for a bidirectional exec stream. */
function engineHijack(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request({
      socketPath,
      path,
      method: 'POST',
      headers: {
        Host: 'd',
        'Content-Type': 'application/json',
        Connection: 'Upgrade',
        Upgrade: 'tcp',
        'Content-Length': Buffer.byteLength(payload),
      },
    });
    req.on('upgrade', (_res, socket) => resolve(socket));
    req.on('response', (res) => {
      if ((res.statusCode || 0) < 300 && res.socket) resolve(res.socket);
      else {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => reject(new Error(`exec start ${res.statusCode}: ${Buffer.concat(chunks)}`)));
      }
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// --- WebSocket authentication via the existing API --------------------------

async function authenticate(reqHeaders) {
  const cookie = reqHeaders.cookie;
  if (!cookie) return null;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`, { headers: { cookie } });
    if (!res.ok) return null;
    const body = await res.json();
    return body && body.success ? body.data.user : null;
  } catch {
    return null;
  }
}

// --- exec session -----------------------------------------------------------

async function startExec(ws, containerId, shell) {
  const cmd = shell ? [shell] : ['/bin/sh'];
  let execId;
  try {
    const created = await enginePost(`/containers/${encodeURIComponent(containerId)}/exec`, {
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: cmd,
    });
    execId = created.Id || created.id;
    if (!execId) throw new Error('engine did not return an exec id');
  } catch (err) {
    ws.send(`\r\n\x1b[31mFailed to create exec session: ${err.message}\x1b[0m\r\n`);
    ws.close();
    return;
  }

  let socket;
  try {
    socket = await engineHijack(`/exec/${execId}/start`, { Detach: false, Tty: true });
  } catch (err) {
    ws.send(`\r\n\x1b[31mFailed to attach: ${err.message}\x1b[0m\r\n`);
    ws.close();
    return;
  }

  socket.on('data', (chunk) => {
    if (ws.readyState === ws.OPEN) ws.send(chunk.toString('utf8'));
  });
  socket.on('close', () => ws.close());
  socket.on('error', () => ws.close());

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.type === 'stdin' && typeof msg.data === 'string') {
      socket.write(msg.data);
    } else if (msg.type === 'resize' && msg.cols && msg.rows) {
      enginePost(`/exec/${execId}/resize?h=${Number(msg.rows)}&w=${Number(msg.cols)}`).catch(() => {});
    }
  });

  ws.on('close', () => socket.end());
  ws.on('error', () => socket.end());
}

// --- boot -------------------------------------------------------------------

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    handle(req, res);
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws/exec') {
      socket.destroy();
      return;
    }

    const user = await authenticate(req.headers);
    // exec requires operator or admin
    if (!user || (user.role !== 'operator' && user.role !== 'admin')) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const containerId = url.searchParams.get('id');
    if (!containerId) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      startExec(ws, containerId, url.searchParams.get('shell') || undefined);
    });
  });

  server.listen(port, hostname, () => {
    // eslint-disable-next-line no-console
    console.log(`[panel] ready on http://${hostname}:${port} (engine socket: ${socketPath})`);
  });
});
