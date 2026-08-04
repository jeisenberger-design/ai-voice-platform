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
- **Agents** — screens (list, detail, prompt studio, structured editor, validation)
  still display from the legacy `promptVersion` + `model` fixture (`mock-data.ts`) —
  that's still Phase 3, not done. The **execution path is no longer one of those
  screens**, though: `agent-model-design.md` §9 records the approved Agent Versioning
  decision (a stable Agent owning one editable draft plus immutable published
  versions), Phase 1 of its implementation plan built the repository
  (`lib/agent-model.ts`, `lib/agent-repository.ts`, `lib/agent-migration.ts`), and
  **Phase 2 wired the engine onto it**: `runConversationSession` resolves and pins one
  published `AgentVersion` per agent a workflow references before a session starts,
  `MockAgentRuntime` resolves through that pinned snapshot instead of the fixture, and
  every event on the run carries immutable `workflowId`/`workflowVersion`/`agentId`/
  `agentVersionId` provenance unaffected by a version published mid-session. The
  testing panel drives a real test consultation through the Conversation Runtime (see
  below) rather than a local fake chat — and, as an unplanned side effect of Phase 2
  touching the shared runtime it already calls, that consultation is now also
  provenance-pinned, even though the panel's own display still reads the old fixture.
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
  interruption case. Phase 4's core is now done too: `ConversationTurn` naming was
  clarified (the flat `{ speaker, text }` transcript shape was renamed `TranscriptLine`
  to stop colliding with the canonical turn-lifecycle type), the `projectTurns`
  projection was implemented and tested, and a Turns tab surfaces it in the workflow
  run panel. Only `invocationId`-based tool-call pairing (for async tools) remains open
  within phase 4. See `conversation-runtime-design.md`.
- **Unified conversation execution** — there is now exactly one execution path for any
  agent/caller exchange in the codebase: `MockConversationRuntime` driving
  `consultWorkflow()` over the one `ExecutionRecorder` event stream. The agent testing
  panel previously ran its own disconnected, hand-scripted fake chat; it now drives a
  real consultation the same way the workflow "Run test" button does, via a pluggable
  caller-turn source (scripted for workflow runs, interactive for agent testing). See
  `ARCHITECTURE.md`'s Architecture Milestones and Conversation Runtime sections.
- **Conversation Runtime stabilization** — a follow-up pass closed real gaps in that
  unification: the agent testing panel's End action now genuinely cancels an in-flight
  session instead of abandoning it; every way a session can stop reports a truthful
  reason (a malformed graph or exhausted safety guard is never reported as a successful
  completion); turns carry stable ids with correct causality; and both the "Run test"
  button and agent testing now share one envelope-producing function instead of each
  assembling `run.started`/`runtime.completed`/`run.completed` by hand. See
  `ARCHITECTURE.md`'s Architecture Milestones section.
- **Calls Intelligence** — the original mock call-operations experience: `/calls`
  performance/search/table and `/calls/[id]` transcript, timeline, extracted data, and
  quality evaluation, backed by `lib/mock-calls.ts`. This remains a hand-authored
  fixture model, not a projection of the event stream — see "Next major milestone"
  below.

## Next major milestone: the Calls domain

With conversation execution unified onto one event-sourced path, the next major
architectural milestone is bringing Calls Intelligence onto that same foundation:
`CallRecord` (`lib/mock-calls.ts`) should become a projection of one session's event
stream rather than a hand-authored parallel structure — the resolution direction
`ARCHITECTURE.md`'s known-debt list already names. This is where every layer built so
far (workflow execution, the Conversation Runtime, event sourcing, the projection
layer) converges into one product surface, and it's sequenced after the execution path
was unified specifically so Calls can represent both workflow runs and agent tests
faithfully from the start, rather than needing revisiting once agent testing produced
its own real sessions.

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
