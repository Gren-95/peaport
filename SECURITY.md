# Security Policy

Peaport talks to a container engine socket, which is **equivalent to root on the
host**. Treat any deployment as security-sensitive: serve it over HTTPS
(`COOKIE_SECURE=true`) behind a reverse proxy, on a trusted network.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Instead, report privately via GitHub's
[private vulnerability reporting](https://github.com/Gren-95/peaport/security/advisories/new)
(Security → Report a vulnerability).

Include: affected version/commit, reproduction steps, and impact. We aim to
acknowledge within a few days and will coordinate a fix and disclosure.

## Scope

In scope: authentication/session handling, RBAC, CSRF, secret storage/encryption,
the compose/exec execution paths, and any way to bypass authorization.

Out of scope: issues that require already having valid `admin` access (admin is
fully privileged by design), or risks inherent to exposing the engine socket.

## Hardening checklist

- Set a strong `SESSION_SECRET` and a dedicated `SECRETS_KEY`.
- Change the bootstrap admin password (enforced on first login).
- Serve over TLS with `COOKIE_SECURE=true`.
- Restrict network access to the panel and the engine socket.
