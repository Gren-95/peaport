# Contributing to Peaport

Thanks for your interest! Peaport is GPL-3.0-or-later; by contributing you agree
your contributions are licensed under the same terms.

## Development setup

Requires [bun](https://bun.sh) and a reachable container engine socket
(Podman or Docker).

```bash
bun install
cp .env.example .env.local        # point PODMAN_SOCKET_PATH at your socket
bun run dev                       # http://localhost:3000
```

Or run the whole thing in a container: `./jumpstart.sh` (see the README).

## Checks (run before opening a PR)

```bash
bun run typecheck     # tsc --noEmit
bun run test          # unit tests
bun run build         # production build (catches route/page issues tsc misses)
bun run test:e2e      # Playwright golden path (needs the engine socket)
```

CI runs typecheck, unit tests, build, and the E2E suite on every PR.

## Conventions

- **Branches:** `feat/…`, `fix/…`, `chore/…`, `docs/…`. Never commit to `main`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- **Code:** TypeScript, English throughout. Validate all input (zod), keep
  authorization server-side, never log secrets. Page files may only export the
  Next.js page contract — put shared helpers in `src/lib` or `src/components`.
- Keep PRs small and focused; add/adjust tests for behaviour changes.

## Reporting issues

Use the issue templates for bugs and feature requests. For security problems,
follow [SECURITY.md](SECURITY.md) instead of filing a public issue.
