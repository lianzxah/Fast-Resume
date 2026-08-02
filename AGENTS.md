# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm/Turbo monorepo for a canvas-based resume editor. Packages live under `packages/*`:

- `packages/editor`: React 18 + Vite UI, with pages, layout components, hooks, stores, API helpers, and styles in `src/`.
- `packages/server`: Hono/Node API, database setup, middleware, routes, services, and local SQLite data in `data/`.
- `packages/canvas-engine`: reusable canvas/editor logic and React bindings.
- `packages/shared`: shared types, stable cross-package contracts, and pure utilities.
- `packages/templates`: resume template definitions.
- `packages/ai-agent`: LangChain/LangGraph agent entry point.

Do not hand-edit generated outputs such as `dist/`, `.turbo/`, `node_modules/`, or local server database files.

Each package keeps production code in `src/` and tests in a single package-root `__test__/`
directory that mirrors the `src/` layout. See `docs/architecture/project-structure.md` for the
canonical package boundaries and dependency direction.

## Architecture Boundaries

Dependencies flow from product packages toward stable foundations: `editor` may depend on
`canvas-engine`, `templates`, and `shared`; `server` may depend on `ai-agent`, `templates`, and
`shared`; `canvas-engine`, `templates`, and `ai-agent` may depend on `shared`. `shared` must not
depend on another workspace package. Import another package only through its public package entry,
never through its `src/` internals.

Keep HTTP handling in server routes and business or persistence logic in services. Keep page
composition in editor pages, reusable UI in components, state in stores, and browser/API adapters in
lib or focused hooks. Reusable canvas and layout behavior belongs in `canvas-engine`; cross-runtime
contracts belong in `shared`.

## Build, Test, and Development Commands

Use pnpm with Node 20 or newer.

- `pnpm install`: install dependencies from `pnpm-lock.yaml`.
- `pnpm dev`: run package development tasks through Turbo.
- `pnpm build`: build packages in dependency order.
- `pnpm lint`: run TypeScript `--noEmit` checks across packages.
- `pnpm test`: run Turbo test tasks.
- `pnpm check:structure`: verify that test artifacts follow the package directory convention.
- `pnpm format`: format TypeScript, JavaScript, JSON, CSS, and Markdown with Prettier.

For package-specific work, use filters such as `pnpm --filter @resume-editor/editor dev` or `pnpm --filter @resume-editor/server test`.

## Coding Style & Naming Conventions

The codebase is TypeScript-first and uses ES modules. Follow existing naming: `PascalCase` React components such as `EditorPage.tsx`, camelCase hooks such as `useResumePersistence.ts`, and kebab-case store/helper files such as `auth-store.ts`. Keep shared contracts in `packages/shared`.

Prettier is configured for 2 spaces, semicolons, single quotes, trailing commas where valid in ES5, LF endings, and a 100-character print width.

## Testing Guidelines

Vitest is the test runner. The root `vitest.workspace.ts` includes every package. Name tests
`*.test.ts` or `*.test.tsx` and place them only in `<package>/__test__/`, mirroring the source path
(for example, `src/services/auth.ts` is tested by `__test__/services/auth.test.ts`). Keep snapshots
in a sibling `__snapshots__/` below `__test__/`. Do not use `tests/`, `__tests__/`, `*.spec.*`, or
tests colocated in `src/`. Add focused tests for shared utilities, canvas behavior, server services,
editor behavior, AI orchestration, and template data.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so no project-specific commit pattern could be inferred. Use short imperative subjects such as `Add resume import validation`, with a body when behavior or migration details matter.

Pull requests should include a concise summary, affected packages, test results (`pnpm lint`, `pnpm test`, or targeted filters), linked issues when available, and screenshots or recordings for editor UI changes.

## Security & Configuration Tips

Do not commit secrets, local `.env.*local` files, or private resume data. Treat `packages/server/data/` as local development state unless a change explicitly requires checked-in fixtures.
