# packages/web-portal — @claude-flow-novice/web-portal

React SPA (Vite, client on port 3001) + Express backend (`src/server`), consolidating 8 legacy dashboards into one portal for monitoring agents/swarms/metrics.

## Rules (local only)

- **Two build targets, two tools.** Client → `vite build`; server → `swc src/server` (NOT tsc — tsc is types-only via `build:server:types`). `npm run build` runs both. Entry: `dist/server/index.js`.
- **Dev needs both processes.** `npm run dev` runs client + server concurrently; running only one gives a blank UI or a dead API.
- **Frontend changes must be verified with Playwright** (`npm run test:e2e`) — this package has a real frontend.
- **Client/server API boundary:** the SPA talks to Express over REST + WebSocket. Keep the shared request/response types in `src/shared` as the single source; don't let client define fallback shapes that drift from the server.

## Commands

- test (all shards): `npm run test:all` — vitest is split into per-area shards (stores/hooks/components/services/server/views/integration/performance/a11y); `npm test` alone runs the root vitest set only.
- typecheck: `npm run type-check`
- e2e: `npm run test:e2e`
