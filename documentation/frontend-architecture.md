# Frontend architecture

This file covers the Next.js application's own conventions — route/component
organization and the CRUD-data integration seam. For the deeper system (workflow
execution, the event model, the runtime provider boundary, the Conversation Runtime),
see [`ARCHITECTURE.md`](../ARCHITECTURE.md) at the repo root — that is the source of
truth; this file does not repeat it.

## Scope

The frontend is a standalone Next.js application. It deliberately contains no backend
endpoints, authentication implementation, or persistence. All page data comes from
typed local fixtures and a mock execution runtime (see `ARCHITECTURE.md`), both
replaceable at integration time without this app's route/component structure changing.

## Repository structure

```
frontend/
  app/(platform)/         Route-level layouts and pages (agents, tools, workflows,
                           calls, knowledge, analytics, prompt-studio, ...)
  components/              Reusable product and UI components (see below)
  hooks/use-platform-data.ts   React Query hooks over lib/mock-api.ts
  lib/                     Utilities, fixtures, and the execution engine —
                           see ARCHITECTURE.md's directory map for lib/*
  stores/                   Zustand — local UI state only (filters, builder drafts)
backend/                    Reserved for future services (empty)
shared/                     Reserved for contracts and common utilities (empty)
infrastructure/             Reserved for deployment and platform configuration (empty)
documentation/              Product and engineering documentation
```

There is no `frontend/types/` directory — shared frontend types currently live
alongside their domain in `lib/` (e.g. `mock-workflows.ts`, `mock-tools.ts`,
`workflow-context.ts`), not in a separate types module.

## Component organization

- `components/ui/` — small primitives aligned with shadcn/ui conventions.
  `components/ui.tsx` is a compatibility barrel re-exporting from `components/ui/*`;
  it exists because feature code still imports from `@/components/ui` rather than the
  directory directly — that migration hasn't happened yet.
- `components/layout/` — the persistent sidebar, header, and responsive shell.
- **Some domains have their own folder** (`components/calls/`, `components/tools/`,
  `components/workflows/`); **agent-related components do not** —
  `agent-detail-workspace.tsx`, `agent-prompt-studio.tsx`, `agent-testing-panel.tsx`,
  `agent-validation-summary.tsx`, and `structured-editor.tsx` are flat files at
  `components/` root. This is the current state, not a convention to replicate —
  new domains have been given their own folder.
- Route files in `app/(platform)/` stay thin: list pages compose feature components
  and read data through a hook; **detail routes** (`agents/[id]`, `tools/[id]`,
  `workflows/[id]`, `calls/[id]`) are async Server Components that call their
  `lib/mock-*.ts` fetch function directly, bypassing `mock-api.ts` and the
  corresponding singular hook (`useTool`, `useWorkflow`, `useCall` in
  `use-platform-data.ts` exist but are currently unused). List pages and detail pages
  therefore fetch differently today; this split is not yet reconciled.

## State management

Zustand holds local, cross-route UI state only (list filters, builder drafts,
sidebar/theme) — never execution or server-shaped state. Server-shaped data for list
views is read through React Query hooks in `hooks/use-platform-data.ts`, which wrap
`lib/mock-api.ts`. See `ARCHITECTURE.md`'s Presentation section for how this composes
with the event/projection model that backs the workflow run panel specifically.

## CRUD-data integration path (mock-api → real API)

This is the seam for organizations, agents, prompt versions, knowledge sources, calls,
and analytics — ordinary list/detail data, as distinct from workflow *execution*, whose
provider boundary (`AgentRuntime`/`ToolRuntime`/`KnowledgeRuntime`/`ChannelRuntime`) is
covered in `ARCHITECTURE.md`.

`lib/mock-api.ts` is the current service boundary consumed by
`hooks/use-platform-data.ts`; `lib/mock-data.ts`, `mock-tools.ts`, `mock-workflows.ts`,
and `mock-calls.ts` are its fixture sources. The migration path:

1. Move each exported fixture function behind a domain API client in `lib/api`.
2. Keep the corresponding React Query hook and query keys stable — this already holds
   for list pages; detail routes will need to move onto their hooks first (see above).
3. Replace mock response types with contracts sourced from `shared/`.
4. Add authenticated fetch transport, error normalization, pagination, mutations, and
   optimistic updates at the API-client boundary.

The UI should never call a route handler or `fetch` directly from a component —
components consume hooks, or in the case of detail routes, a Server Component's direct
fixture call (see above), not raw `fetch`.
