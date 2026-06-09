# Podman Panel

An advanced, multi-user web dashboard for managing **Podman** (and any
Docker-API-compatible engine). Built for power users: full container lifecycle
control, live log streaming, an interactive exec terminal, real-time stats, and
management of images, volumes, networks, and pods — with role-based access
control and session management.

## Features

- **Stacks (Compose)** — create/upload Compose files in the UI and manage them
  as stacks: deploy (`up`), pull, stop, restart, `down`, and delete, with live
  streamed command output. Status is derived from the compose project labels on
  the running containers. Driven by the bundled Compose CLI against the socket.
- **Secrets** — AES-256-GCM encrypted, **write-only** store. Reference a secret
  in any compose file as `${NAME}`; it is decrypted only on the server at deploy
  time and injected into the engine process environment for interpolation, so
  plaintext is never shown to other users or written into stored files.
- **Containers** — list, inspect, start/stop/restart/kill/pause, remove, with
  live multiplexed **log streaming**, **resource stats** (CPU / memory / network
  / block IO), and an in-browser **exec terminal** (xterm.js over WebSocket).
- **Images** — list, inspect, streaming **pull** with progress, prune, remove.
- **Volumes / Networks** — list, create, inspect, prune, remove.
- **Pods** — list, inspect, start/stop/restart, remove (Podman `libpod` API;
  gracefully reported as unsupported when connected to Docker).
- **Users & RBAC** — three roles:
  - `viewer` — read-only (list, inspect, logs, stats)
  - `operator` — viewer + lifecycle actions, exec, pull, prune
  - `admin` — operator + destructive removals + user management
- **Security** — bcrypt password hashing, server-side sessions with idle and
  absolute timeouts, CSRF protection on all mutations, rate-limited login,
  security headers (CSP, HSTS-ready, etc.), and audit-friendly generic errors.

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · better-sqlite3 ·
a custom Node server for WebSocket exec. Package manager: **bun**.

## Architecture

```
Browser ──HTTP/SSE──> Next.js route handlers ──unix socket──> Podman / Docker API
        ──WebSocket──> server.js (exec)      ──unix socket──> /exec attach (hijacked)
                         │
                         └── SQLite (users, sessions)
```

The Podman REST API is Docker-API-compatible, so the same code runs against
either engine. Pod features use Podman's `libpod` endpoints.

## Quick start (local development)

Requires Node.js ≥ 20 and [bun](https://bun.sh).

```bash
bun install
cp .env.example .env.local        # then edit values

# Point at your engine socket in .env.local, e.g. for local testing on Docker:
#   PODMAN_SOCKET_PATH=/var/run/docker.sock
# Rootless Podman:  PODMAN_SOCKET_PATH=/run/user/$(id -u)/podman/podman.sock

bun run dev                       # http://localhost:3000
```

On first launch a bootstrap admin is created from `ADMIN_USERNAME` /
`ADMIN_PASSWORD` (defaults `admin` / `changeme`). **Change the password
immediately** under Settings.

### Enable the Podman API socket

Rootless (recommended):

```bash
systemctl --user enable --now podman.socket
# socket at: /run/user/$(id -u)/podman/podman.sock
```

Rootful:

```bash
sudo systemctl enable --now podman.socket
# socket at: /run/podman/podman.sock
```

## Running with Docker / Podman (dockerized)

```bash
# 1. Provide a strong session secret (required).
export SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
export ADMIN_PASSWORD='choose-a-strong-password'

# 2. Build and start.
docker compose up -d --build        # or: podman-compose up -d --build
```

Open http://localhost:3000.

### Mounting the right socket

Edit the `volumes` entry in `docker-compose.yml` to map your engine's socket to
`/var/run/docker.sock` inside the container:

| Engine            | Host socket                                  |
|-------------------|----------------------------------------------|
| Docker            | `/var/run/docker.sock`                        |
| Rootful Podman    | `/run/podman/podman.sock`                     |
| Rootless Podman   | `${XDG_RUNTIME_DIR}/podman/podman.sock`       |

For **rootless Podman**, run the dashboard container with the user namespace
kept so the mounted socket is accessible:

```bash
podman run -d --name podman-panel \
  --userns=keep-id \
  -p 3000:3000 \
  -e SESSION_SECRET="$SESSION_SECRET" \
  -e PODMAN_SOCKET_PATH=/run/podman/podman.sock \
  -v ${XDG_RUNTIME_DIR}/podman/podman.sock:/run/podman/podman.sock \
  -v panel-data:/app/data \
  podman-panel:latest
```

> **Security note:** access to the engine socket is equivalent to root on the
> host. Run the dashboard on a trusted network and put it behind a TLS reverse
> proxy (set `COOKIE_SECURE=true`) before exposing it.

## Configuration

All configuration is via environment variables — see `.env.example` for the
full list (socket path, session secret, data dir, port, bootstrap admin,
session timeouts, cookie security).

## Scripts

```bash
bun run dev         # development server (custom server with WebSocket exec)
bun run build       # production build
bun run start       # run the production build
bun run typecheck   # tsc --noEmit
bun run lint        # next lint
bun run test        # unit tests (bun test) — rbac, crypto, auth, audit, container spec
```

## Project layout

```
server.js                 # custom Next server + /ws/exec WebSocket
src/
  lib/                    # podman client, db, auth, api guards, validation, sse
  app/api/                # REST route handlers
  app/(app)/              # authenticated pages
  app/login/              # login screen
  components/             # UI, LogViewer, StatsPanel, ExecTerminal, shell
  middleware.ts           # security headers + auth gate
data/                     # SQLite database (gitignored, mount as a volume)
```
