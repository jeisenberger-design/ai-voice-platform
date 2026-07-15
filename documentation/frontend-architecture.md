# Frontend architecture

## Scope

The frontend is a standalone Next.js application for visualizing the AI voice platform product experience. It deliberately contains no backend endpoints, authentication implementation, or persistence. All page data comes from typed local fixtures and can be replaced at integration time.

## Repository structure

```
frontend/                 # Next.js application
  app/                    # Route-level layouts and pages
  components/             # Reusable product and UI components
  hooks/                  # UI-focused hooks
  lib/                    # Utilities, mock data and query client
  stores/                 # Zustand client-side UI state
  types/                  # Shared frontend types
backend/                  # Reserved for future services
shared/                   # Reserved for contracts and common utilities
infrastructure/           # Reserved for deployment and platform configuration
documentation/            # Product and engineering documentation
```

## Component strategy

The application uses layered, composable components:

- `components/ui` contains small primitives aligned with shadcn/ui conventions.
- `components/layout` owns the persistent sidebar, header, and responsive shell.
- `components/dashboard`, `components/agents`, and related feature folders compose page-specific views from primitives.
- Route files in `app/(platform)` remain thin: they set page metadata and compose feature-level components.

This keeps visual language consistent while making individual domains straightforward to evolve independently.

## State management

Zustand is reserved for local, cross-route interface state: navigation state, selected organization, theme preference, and transient builder state. Server-shaped data is accessed through React Query hooks in `hooks/use-platform-data.ts`, even while it is served by local mock functions. This preserves loading, error, and cache boundaries so an API integration does not force a page rewrite.

## Future backend integration

`frontend/lib/mock-data.ts` is the only current source of product records, and `frontend/lib/mock-api.ts` is the local service boundary used by React Query. The migration path is:

1. Move each exported fixture function behind a domain API client in `lib/api`.
2. Keep the corresponding React Query hook and query keys stable.
3. Replace mock response types with contracts sourced from `shared/`.
4. Add authenticated fetch transport, error normalization, pagination, mutations, and optimistic updates at the API-client boundary.

Likely integration domains are organizations, agents, prompt versions, knowledge sources, calls, analytics, user management, and system health. The UI should never call a route handler or `fetch` directly from a component.
