# syntax=docker/dockerfile:1

# ---- builder: install deps (bun) and produce the Next.js build ----
# Use the same Debian base (bookworm) as the runner so the native
# better-sqlite3 binary links against a matching glibc.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Build toolchain (for native modules) + bun as the package manager.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ unzip curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g bun@1

# Fetch the standalone Docker Compose v2 binary. It speaks the Docker API
# directly (via DOCKER_HOST) and drives both Docker and Podman sockets.
ARG COMPOSE_VERSION=v2.32.4
RUN curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
      -o /usr/local/bin/docker-compose \
  && chmod +x /usr/local/bin/docker-compose \
  && /usr/local/bin/docker-compose version

# Install dependencies first for better layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the application.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bunx next build

# ---- runner: minimal Node.js runtime (server.js needs Node) ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app

# nmcli (NetworkManager CLI) powers best-effort static/DHCP detection for the
# network-adapters widget. It talks to the host's NetworkManager over the system
# D-Bus socket when the container runs with host networking (see jumpstart --host-net).
RUN apt-get update \
  && apt-get install -y --no-install-recommends network-manager iproute2 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data \
    COMPOSE_COMMAND=docker-compose

# Copy only what the runtime needs. The better-sqlite3 binary fetched during
# the bun install is built against the Node ABI and runs under Node.
COPY --from=builder /usr/local/bin/docker-compose /usr/local/bin/docker-compose
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/server.js ./server.js

# Persisted SQLite database lives here; declare it as a volume.
RUN mkdir -p /app/data && chown -R node:node /app
VOLUME ["/app/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
