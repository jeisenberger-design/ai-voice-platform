# Architecture

This is a living description of how the system is actually built, not a plan or a
prompt. Update it in the same commit as any change that moves a boundary described
here — a new layer, a new event type, a changed contract. If this file and the code
disagree, the code is right and this file is stale; fix the file.

For product vision and behavioral ground rules, see `CLAUDE.md` and
`documentation/project-constitution.md`. For the Conversation Runtime's design record
(the decisions, not just the current shape), see
`documentation/conversation-runtime-design.md`. This file is the map; that one is the
minutes of the meeting where the map was drawn.

## Scope

Frontend-only. There is no backend yet (`backend/`, `shared/`, `infrastructure/` are
empty placeholders). Everything described below runs in the browser against typed
mock data and a mock runtime — the architecture is built so that stops being true one
layer at a time, without the layers above needing to change.

## The shape of the system

```
Workflow Definition  →  Execution Engine  →  Conversation Runtime  →  Runtime Interfaces  →  Providers (future)
      (data)              (consultWorkflow)      (owns time/turns)      (Agent/Tool/            (real LLM,
                                                                          Knowledge/Channel)       telephony, ...)
```

Read this left to right as "what" then "how it runs" then "how it's experienced over
time" then "who actually does the work." Each arrow is a real interface boundary, not
just a mental one — the code on the right of an arrow never reaches back to concrete
types on the left.

- **Workflow Definition** is pure, serializable data. No behavior, no runtime coupling.
- **Execution Engine** (`consultWorkflow`) evaluates policy and traverses the graph. It
  never owns time, waits, or knows what a "turn" is.
- **Conversation Runtime** owns sessions, turns, interruption, and directive
  execution — it decides *when* to consult the engine again, not *what* the engine
  decides.
- **Runtime Interfaces** are the provider boundary: four async contracts
  (Agent/Tool/Knowledge/Channel) that the engine calls through. Only mock
  implementations exist today.
- **Events** are the canonical record threaded through all of this — see below before
  everything else, because it's the thing every other section assumes.

## Events are the source of truth

`lib/workflow-events.ts` defines `ExecutionEvent`, an append-only, immutable
discriminated union. `ExecutionRecorder` assigns each event a monotonic `seq`, a
deterministic simulated clock `t`, a wall-clock `emittedAt`, and identity fields:

```
EventIdentity = { schemaVersion, sessionId, runId, consultationId?, turnId?,
                   eventId, parentEventId?, stepId?, nodeId?, seq, t, emittedAt,
                   durability }
```

Correlation is compositional and nests in this order: `stepId` (one node execution) →
`consultationId` (one policy consultation, many node executions) → `turnId` (one
conversational turn) → `sessionId` (everything). `parentEventId` carries causality
independently of that nesting — e.g. a resumed consultation's parent is the prior
consultation's `consultation.paused` event, a real causal link, not a synthesized one.

**The invariant that must never break:** run state — `path`, `finalContext` — is not
stored, it is *derived* by folding events (`lib/workflow-projections.ts`). If code
anywhere mutates `WorkflowContext` without emitting the matching `state.changed` (or
`conversation.turn`) event, `fold(events) !== actual context` and every projection
downstream is now lying. This has already mattered once: `MockConversationRuntime`
sets `metadata.detected_intent` outside any `NodeExecutor`, so it manually emits the
`state.changed` event for that mutation. Any future code that touches context outside
an executor must do the same.

Every other read model — Timeline, State, Tool Calls, Conversation, and (per the
design doc) future Analytics — is a **projection** of this one stream
(`lib/workflow-projections.ts`). There are no parallel data structures to keep in
sync. When you want a new view of a run, write a projection function; don't add a
new field that has to be kept consistent by hand.

`WorkflowRun` (`lib/workflow-execution.ts`) is a compatibility container, not a
second source of truth — its `path`/`finalContext` are computed by the same
projections a component could call directly.

## Execution: consultWorkflow, not "run to completion"

The core primitive is `consultWorkflow` (`lib/workflow-consultation.ts`):

```
consultWorkflow(workflow, context, stimulus, cursor, runtime, recorder, ...)
  → { status: 'paused' | 'completed', cursor, context, directives, waitReason?, events }
```

It advances the graph from `cursor` via `NodeExecutor` until it hits a **wait point**
(`agent` — awaiting the caller's next turn; `transfer` — hand-off) or `end`, then
returns control. It does *not* walk a workflow start-to-finish by itself — that would
mean the engine owns time, which it deliberately never does. `WAIT_POINT_REASON` in
that file is the single place that classifies which node kinds pause and why; `tool`
pauses only once `ToolRuntime` grows real `mode: 'async'` support, so it's absent from
that map today, not forgotten.

`NodeExecutor` (`lib/workflow-executors.ts`) is the stable per-node-kind contract:

```
(node, context, outgoing, runtime, meta, workflowId) → Promise<ExecutionResult>
```

This is the seam a real engine implementation replaces, one node kind at a time,
without the consultation loop or anything above it changing. Executors never read
fixtures directly — every provider interaction goes through the injected
`PlatformRuntime`.

**Directives are synthesized in `workflow-consultation.ts`, not returned by
`NodeExecutor`.** `{ speak, listen, invoke_tool, transfer, end }` describe what the
Conversation Runtime should do in the world; that's a conversation-layer concept, kept
deliberately out of the engine's stable contract.

`simulateWorkflowRun` (`lib/workflow-execution.ts`) is **only** a compatibility
wrapper now — it exists so the "Run test" button and existing projections keep a
single async call that runs a session to completion. It constructs a
`MockConversationRuntime` and drives it; nothing about it is load-bearing
architecture.

## Conversation Runtime: owns time, not policy

`lib/conversation-runtime.ts` (`MockConversationRuntime`) is deliberately a separate
layer from the engine, per `documentation/conversation-runtime-design.md`'s central
argument: a phone call is a long-running, interruptible, event-driven loop, and a
workflow graph is a policy artifact. Merging them would couple workflow definitions to
channel physics.

What it does, concretely: after each `consultWorkflow` call, it processes the
returned `directives` (`directive.issued` → `completed`, or `abandoned` +
`turn.interrupted` when the upcoming scripted turn interrupts an interruptible
`speak`), then decides the next `Stimulus` — a real scripted caller turn on an
`agent_turn` pause (`lib/conversation-scenarios.ts`), or a system timer for
`transfer`/future `async_tool` pauses, which have no caller response to react to.

`lib/conversation-types.ts` declares the target session/turn domain model
(`ConversationSession`, `ConversationTurn`, `Stimulus`, `Directive`, `Cursor`) per the
design doc. **Status: `Stimulus`/`Directive`/`Cursor` are live and load-bearing.
`ConversationTurn` is now projected** — `projectTurns` (`workflow-projections.ts`)
folds `conversation.turn`/`turn.interrupted`/`directive.abandoned`/`intent.detected`
into it, correlating decorating events to the turn open in the same consultation
(there's no turn-identity correlator yet — see below). **`ConversationSession` is
still declared but not instantiated or projected anywhere**; a `projectSession` read
model doesn't exist yet.

This `ConversationTurn` is the only one — `workflow-context.ts`'s simpler
`{ speaker, text }` shape (used for the flat transcript in `WorkflowContext.conversation`
and `projectConversation`) is named `TranscriptLine`, specifically to avoid colliding
with this canonical type.

Two of `ConversationTurn`'s fields are optional because nothing populates them yet:
`turnId` (no emitter assigns one — events correlate by `consultationId` instead) and
`origin` (only `turn.started` carries it, and `turn.started` itself is never emitted;
`conversation.turn` is the only anchor that fires in practice today).

Turn/directive/session lifecycle events are emitted **only** by the Conversation
Runtime, never by an executor — turns are not workflow nodes, and the engine never
creates one. The engine's own `conversation.turn` emission (via `appendTurn` inside an
executor) is a flat transcript side-effect, unrelated to the turn *lifecycle* events
layered on top by the Conversation Runtime for caller turns and interruptions. This is
intentionally a little redundant (see `turn.completed` in the Timeline UI, which is
hidden from display because it duplicates `conversation.turn`'s content) rather than
one event type trying to serve two purposes.

## Runtime Interfaces: the provider boundary

`lib/runtime/contracts.ts` defines four async interfaces — `AgentRuntime`,
`ToolRuntime`, `KnowledgeRuntime`, `ChannelRuntime` — bundled as `PlatformRuntime` and
injected into `consultWorkflow`. Every method is async on purpose: real providers are
network-bound, and defining these synchronously today would force a rewrite of the
engine and UI the moment a real provider shows up. That's the whole point of the
boundary.

`lib/runtime/mock-runtime.ts` implements all four deterministically and is **the only
place in the execution path that reads fixture data** (`mock-data.ts`, `mock-tools.ts`,
`mock-data.ts`'s `sources`). Swapping a mock for a real provider means replacing one of
these four classes — nothing upstream changes.

`Agent` (`lib/mock-data.ts`) carries `promptVersion` + `model` — the minimum
`AgentRuntime` needs to resolve a runnable configuration. Deliberately **not** added
yet: guardrails (needs an enforcement point in the engine first, not just a field),
tool/knowledge bindings (workflows already bind these per-node; agent-level bindings
would create a second source of truth until agent-initiated tool use exists), output
schema (only meaningful once agents produce structured results).

## Presentation

- **Service boundary:** components never call `fetch` or read mock modules directly
  for server-shaped data. `lib/mock-api.ts` is the boundary; `hooks/use-platform-data.ts`
  wraps it in React Query. Two known exceptions bypass this
  (`components/workflows/workflow-detail.tsx`, `components/tools/tool-detail.tsx`
  import `agents`/`tools` fixtures directly) — harmless today, will need fixing before
  API integration.
- **Zustand stores** (`stores/*`) hold local, cross-route UI state only — filters,
  builder drafts, sidebar/theme. Never execution state; that's the event stream's job.
- **The graph is read-only.** `components/workflows/workflow-graph.tsx` renders
  `Workflow.nodes`/`edges` plus a `NodeRunStatus` map derived from the current run's
  `path`; it has no editing affordances yet, by design (see roadmap).
- **The run panel is tabbed projections**, not tabbed data structures. Timeline / State
  / Tool Calls / Conversation in `components/workflows/workflow-run-panel.tsx` are each
  one projection function called on the same revealed event slice.

## Directory map

```
frontend/lib/
  mock-data.ts            Agent fixtures (+ dashboard/knowledge-source fixtures)
  mock-tools.ts            Tool fixtures — typed parameters, typed outputs, mockResult
  mock-workflows.ts        Workflow graph fixtures — nodes/edges/bindings/predicates
  mock-calls.ts             CallRecord fixtures — pre-dates the event model (see below)
  mock-api.ts                 Service boundary consumed by hooks/use-platform-data.ts

  workflow-context.ts       WorkflowContext, VarRef/Operand, pure state helpers
  workflow-predicates.ts    Structured Predicate model + evaluator (no eval)
  workflow-executors.ts     NodeExecutor contract + one executor per node kind
  workflow-consultation.ts  consultWorkflow — the core execution primitive
  workflow-execution.ts     simulateWorkflowRun — compatibility wrapper only
  workflow-events.ts        ExecutionEvent schema + ExecutionRecorder
  workflow-projections.ts   Pure projections over the event stream

  conversation-types.ts     Session/turn domain model, Stimulus/Directive/Cursor
  conversation-runtime.ts   MockConversationRuntime — drives consultations over time
  conversation-scenarios.ts Scripted caller-turn data (phase 3)

  runtime/contracts.ts      AgentRuntime/ToolRuntime/KnowledgeRuntime/ChannelRuntime
  runtime/mock-runtime.ts   Deterministic mocks — only fixture reader in the exec path

frontend/components/workflows/   Read-only graph + tabbed observability panel
frontend/components/agents/...   Agent builder, prompt studio, testing panel
frontend/components/tools/       Tools registry + detail
frontend/components/calls/       Calls Intelligence — see "known debt" below
frontend/stores/                 Zustand — local UI state only
frontend/hooks/use-platform-data.ts   React Query hooks over mock-api.ts
```

## Known architectural debt

Written down so it doesn't have to be rediscovered. None of this blocks current work;
it matters before persistence, multi-tenancy, or a real provider integration.

- **`CallRecord` (`mock-calls.ts`) and `ExecutionEvent` are two competing "call
  record" models.** Calls Intelligence was built before the event model existed.
  Resolution direction: `CallRecord` should become a projection of one session's event
  stream, not a hand-authored parallel structure — but that migration hasn't started.
- **No tenancy dimension.** Nothing carries `orgId`/`projectId` yet, despite the
  constitution naming Organizations/Projects. Cheap to add to core types now; expensive
  to retrofit after persistence exists.
- **No definition versioning on runs.** `Workflow.version` is a display number; a run
  doesn't record which definition snapshot it actually executed against.
  `EventIdentity.schemaVersion` exists but nothing enforces or migrates on it yet.
- **Module-level mutable id counters** (`nextRunId`/`nextSessionId` in
  `workflow-events.ts`) are process singletons — fine for one browser tab, wrong under
  SSR or tests. Should be injected when that matters.
- **Predicates don't compose.** Single flat comparison per edge; no `and`/`or`/`not`.
  Will matter the moment a real routing condition needs more than one clause.
- **`transfer` nodes' tool refs/bindings are currently unused** by the transfer
  executor — the node can carry `ref`/`inputBindings` but nothing reads them yet.

## Roadmap (per `documentation/conversation-runtime-design.md`)

Conversation Runtime phases 1–3 are done: event identities + session/turn concepts,
consultation-based execution, scripted multi-turn scenarios with one interruption
case. Phase 4's projection half is started: `projectTurns` exists and is tested
(`workflow-projections.test.ts`, the first test suite in this repo — see the `test`
script and `vitest.config.ts`), but it is **not wired into any component** — no Turns
tab, no transcript-from-turn-events UI. `invocationId`-based tool-call pairing (for
when tools stop being purely synchronous) also hasn't started. Explicitly not started
by design, and not to be started without a fresh scoping pass: a graph-authoring/
editing canvas, real voice streaming, backend persistence, multi-tenant infrastructure.
