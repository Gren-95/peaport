# syntax=docker/dockerfile:1

# ---- prod-deps: production-only node_modules (keeps the runtime image small) ----
FROM node:26-bookworm-slim AS prod-deps
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g bun@1
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- builder: full deps + Next.js production build ----
FROM node:26-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ unzip curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g bun@1

# Standalone Docker Compose v2 binary (arch-aware). It speaks the Docker API
# directly via DOCKER_HOST and drives both Docker and Podman sockets.
ARG TARGETARCH
ARG COMPOSE_VERSION=v2.32.4
RUN case "${TARGETARCH:-amd64}" in \
      amd64) CARCH=x86_64 ;; \
      arm64) CARCH=aarch64 ;; \
      *) CARCH=x86_64 ;; \
    esac \
  && curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-${CARCH}" \
       -o /usr/local/bin/docker-compose \
  && chmod +x /usr/local/bin/docker-compose

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bunx next build

# ---- runner: minimal Node.js runtime (server.js needs Node) ----
FROM node:26-bookworm-slim AS runner
WORKDIR /app

# nmcli (NetworkManager CLI) powers best-effort static/DHCP detection for the
# network-adapters widget, via the host's NetworkManager over the D-Bus socket
# when run with host networking (jumpstart --host-net).
RUN apt-get update \
  && apt-get install -y --no-install-recommends network-manager iproute2 \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATA_DIR=/app/data \
    COMPOSE_COMMAND=docker-compose

COPY --from=builder /usr/local/bin/docker-compose /usr/local/bin/docker-compose
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/server.js ./server.js

# Only the data dir needs to be writable by the runtime user; the rest of /app
# is read-only at runtime and stays root-owned (world-readable) — avoids
# duplicating node_modules into a chown layer.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
