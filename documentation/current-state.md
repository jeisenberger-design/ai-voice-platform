# Current product state

A status snapshot of what exists in the repository — what is built, what is still mock,
and what is deliberately not built yet. For *how* any of it works, see
[`ARCHITECTURE.md`](../ARCHITECTURE.md) (the source of truth); this file does not
re-describe mechanics. For the Conversation Runtime's design and phasing, see
[`conversation-runtime-design.md`](conversation-runtime-design.md).

Still frontend-only: no backend services, API routes, persistence, authentication,
telephony, or real model/voice providers exist. Everything below runs in the browser
against typed fixtures and a mock runtime.

## What exists today

- **Platform shell** — Next.js App Router application, sidebar navigation, theme,
  responsive layout. Routes: dashboard, agents (list / detail / new), prompt studio,
  knowledge, tools (list / detail), workflows (list / detail), analytics, calls
  (list / detail), plus placeholder sections.
- **Agents** — agent model with `promptVersion` + `model` fields, list and detail
  workspaces, prompt studio, structured editor, a local testing panel, and validation.
- **Tools** — registry with typed inputs *and* outputs and a deterministic mock result
  per tool; list and detail views.
- **Knowledge** — knowledge-source concepts and listing (retrieval is served through
  the runtime layer, not a real index).
- **Workflows** — a directed-graph definition model (typed nodes, edges, input/output
  bindings, structured predicates), list and detail views, and a **read-only** execution
  graph.
- **Execution & observability** — a consultation-based execution engine, a typed
  `WorkflowContext`, structured-predicate evaluation, a stable `NodeExecutor` contract,
  an immutable `ExecutionEvent` stream as the canonical run record, and projection-based
  read models surfaced as a tabbed run panel (Timeline / State / Tool Calls /
  Conversation). See `ARCHITECTURE.md`.
- **Runtime abstraction** — four async provider contracts (Agent / Tool / Knowledge /
  Channel) with deterministic mock implementations; the mocks are the only fixture
  readers in the execution path. See `ARCHITECTURE.md`.
- **Conversation Runtime** — phases 1–3 complete: session/turn concepts and event
  identities, consultation-based execution with cursor resumption, and a
  `MockConversationRuntime` that drives scripted multi-turn scenarios including one
  interruption case. Phase 4 (a turns projection / UI) is not started. See
  `conversation-runtime-design.md`.
- **Calls Intelligence** — the original mock call-operations experience: `/calls`
  performance/search/table and `/calls/[id]` transcript, timeline, extracted data, and
  quality evaluation, backed by `lib/mock-calls.ts`.

## Not built yet (by design)

Backend services and API routes, persistence and run replay storage, authentication and
multi-tenant isolation, real LLM/voice provider integrations, telephony/voice streaming,
and any graph-authoring/editing UI. These are sequenced behind the current mock-first
work; see the roadmap and known-debt sections of `ARCHITECTURE.md`.

## Tooling & repository

- Lint / typecheck / build are the definition-of-done gate for any change (run in
  `frontend/`).
- GitHub Actions CI runs that gate on every push/PR to `master`.
- The repository has a GitHub remote; `master` is the working branch.
