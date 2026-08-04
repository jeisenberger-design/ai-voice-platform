# Architecture

This is a living description of how the system is actually built, not a plan or a
prompt. Update it in the same commit as any change that moves a boundary described
here — a new layer, a new event type, a changed contract. If this file and the code
disagree, the code is right and this file is stale; fix the file.

For product vision and behavioral ground rules, see `CLAUDE.md` and
`documentation/project-constitution.md`. For the Conversation Runtime's design record
(the decisions, not just the current shape), see
`documentation/conversation-runtime-design.md`. For the Agent data model's design
record, see `documentation/agent-model-design.md` — **approved; Phases 1–3B of its
implementation plan have landed** (`lib/agent-model.ts`, `lib/agent-repository.ts`,
`lib/agent-migration.ts`, `lib/agent-publish.ts` — canonical types, a versioned
draft/publish repository, publish/rollback orchestration, and a one-time fixture
migration, all tested). Every Agent configuration screen — Configuration, Prompt
Studio, Knowledge, Tools, Testing, and Versions — now reads and writes the same
canonical `AgentRepository` draft/version state by explicit `agentId`; `lib/mock-data.ts`'s
legacy `Agent` fixture remains only for display fields the canonical model doesn't have
yet (e.g. `workflow-detail.tsx`'s agent names), not as a configuration source. This file
is the map; those are the minutes of the meetings where the map was drawn.

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
  → { status: 'paused' | 'completed', cursor, context, directives, waitReason?, outcome?, events }
```

It advances the graph from `cursor` via `NodeExecutor` until it hits a **wait point**
(`agent` — awaiting the caller's next turn; `transfer` — hand-off) or `end`, then
returns control. It does *not* walk a workflow start-to-finish by itself — that would
mean the engine owns time, which it deliberately never does. `WAIT_POINT_REASON` in
that file is the single place that classifies which node kinds pause and why; `tool`
pauses only once `ToolRuntime` grows real `mode: 'async'` support, so it's absent from
that map today, not forgotten.

**`outcome` (a `ConsultationOutcome`, `lib/conversation-types.ts`) is present whenever
`status: 'completed'`, and `'end'` is the only value a well-formed workflow ever
produces.** A missing resume node, a within-consultation cycle, a non-end node with no
outgoing edge, or an edge id that doesn't resolve are each tagged with their own
outcome and recorded on the `consultation.completed` event — a malformed graph can
never be silently reported as a successful completion. (`'missing_edge'` is defensive:
every current `NodeExecutor` only ever proposes a `nextEdgeId` drawn from the node's own
outgoing edges, so that specific outcome is unreachable through real executor behavior
today.) `MockConversationRuntime` reads this to decide the session's own truthful end
reason — see below.

Request/start events (`agent.started`, `tool.invoked`, `knowledge.requested`) are
emitted **before** `consultWorkflow` awaits the executor, not after — a "started" event
must never be a retrospective fiction recorded once the call already finished. Since
that instrumentation can't live inside an executor without widening the stable
`NodeExecutor` contract below, the consultation loop mirrors each executor's own
gating condition (e.g. "does this node have an `agent`-type `ref`?") in miniature to
decide whether to pre-emit. This is a deliberate, small duplication — see the code
comment at the call site — not an oversight. `tool.returned` now also carries `status`
and `error` (previously computed on `ToolIO` but silently dropped when emitted) so a
tool failure is preserved in the canonical stream, not just in the transient result.

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
`turn.interrupted` when the upcoming turn interrupts an interruptible `speak`), then
decides the next `Stimulus` — the next caller turn on an `agent_turn` pause, sourced
from a pluggable `StimulusSource`, or a system timer for `transfer`/future `async_tool`
pauses, which have no caller response to react to.

`StimulusSource` has two implementations, both driving the identical
`consultWorkflow`/event path — there is no second execution engine, just two ways of
sourcing the next caller turn. The default, scripted source replays one deterministic
scenario per workflow (`lib/conversation-scenarios.ts`) — this is what the "Run test"
button uses. An interactive source (`createInteractiveStimulusSource`) resolves each
turn from a live person instead of a script — this is what the agent testing panel
(`components/agent-testing-panel.tsx`) uses, having previously run its own disconnected
`setTimeout`-based fake chat that never touched `WorkflowContext`, `ExecutionRecorder`,
or `consultWorkflow` at all. That gap is closed: agent tests are now real sessions on
the real event stream, observable through the same projections as a workflow run.

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

`turnId` is now assigned and carried on the relevant `EventIdentity`s: an agent/system
turn's id is derived from the step that produced it (`${stepId}-turn`, set in
`emitStateChanges`); a caller turn's id is derived from the consultation it answered
(`${consultationId}-caller`, set in `recordCallerTurn`). Causality follows the turn, not
the pause that merely preceded it — the consultation a caller turn triggers has that
turn's `turn.completed` event as its `parentEventId`, not the prior
`consultation.paused`. `origin` remains optional — only `turn.started` carries it, and
`turn.started` itself is still never emitted; `conversation.turn` is the only anchor
that fires in practice today.

Turn/directive/session lifecycle events are emitted **only** by the Conversation
Runtime, never by an executor — turns are not workflow nodes, and the engine never
creates one. The engine's own `conversation.turn` emission (via `appendTurn` inside an
executor) is a flat transcript side-effect, unrelated to the turn *lifecycle* events
layered on top by the Conversation Runtime for caller turns and interruptions. This is
intentionally a little redundant (see `turn.completed` in the Timeline UI, which is
hidden from display because it duplicates `conversation.turn`'s content) rather than
one event type trying to serve two purposes.

**`MockConversationRuntime.run()` never rejects.** Every way a session can stop —
reaching an `end` node, a caller hangup, an unhandled provider exception, or
exhausting `MAX_CONSULTATIONS` — resolves with a truthful `SessionEndReason`
(`completed` / `transferred` / `caller_hangup` / `error` / `timeout`), recorded on
`session.ended`: `'transferred'` is reported whenever the run issued a `transfer`
directive, even though the graph still walks on to an `end` node afterward; any
malformed-graph `ConsultationOutcome` (see above) or a thrown provider exception both
report `'error'`; exhausting `MAX_CONSULTATIONS` reports `'timeout'`, never
`'completed'`. The whole loop runs inside a single `try`/`catch` for exactly this
reason — no path lets an exception escape as an unhandled rejection.

**Cancellation is real, not just abandonment.** The interactive `StimulusSource`
(`createInteractiveStimulusSource`) exposes `cancel()` alongside `submit()` — calling
it resolves a pending (or not-yet-requested — the two are order-independent, queued the
same way `submit()` already was) `nextCallerTurn()` with `{ kind: 'cancelled' }`,
which `run()` turns into a `caller_hangup` ending. `components/agent-testing-panel.tsx`
wires its End action to this, guarded by a generation token (the same `runToken`
pattern `workflow-detail.tsx` already used) so a session's `onPause`/`.then` callbacks
— which still fire once after settling, as the "render the final state" signal — can't
clobber a reset the user already triggered, or a newer session's state.

**`runConversationSession` (`lib/conversation-runtime.ts`) is the shared envelope
runner**, wrapping `MockConversationRuntime.run()` with `run.started` →
(session lifecycle) → `runtime.completed` → `run.completed`. Both `simulateWorkflowRun`
(`lib/workflow-execution.ts`, the "Run test" button) and the agent testing panel call
this one function rather than each assembling the envelope by hand — an interactive
agent test produces exactly the same lifecycle shape a scripted workflow run does.
`run.completed`'s `outcome` field reports the workflow's own declared outcome variable
on a normal `'completed'` ending, and the session's `SessionEndReason` itself
otherwise — so `run.completed` always fires, and is never a lie about what happened.

**The invariant that must never break:** every conversation execution path in this
codebase — every caller/agent exchange, wherever it's triggered from — flows through
the Conversation Runtime, which drives `consultWorkflow()`, which executes via the
unchanged `NodeExecutor` contract. There is exactly one place that produces execution
events (`ExecutionRecorder`) and exactly one canonical stream per session. UI
components never interpret that stream directly — they consume the projections in
`lib/workflow-projections.ts`. If a future feature needs a new way to run a
conversation, it must add a new `StimulusSource` (or grow the Conversation Runtime),
never a second, parallel driver — that is precisely the mistake `AgentTestingPanel`
made and has since been unwound from.

## Runtime Interfaces: the provider boundary

`lib/runtime/contracts.ts` defines four async interfaces — `AgentRuntime`,
`ToolRuntime`, `KnowledgeRuntime`, `ChannelRuntime` — bundled as `PlatformRuntime` and
injected into `consultWorkflow`. Every method is async on purpose: real providers are
network-bound, and defining these synchronously today would force a rewrite of the
engine and UI the moment a real provider shows up. That's the whole point of the
boundary.

`lib/runtime/mock-runtime.ts` implements all four deterministically. `Tool`/`Knowledge`/
`Channel` read fixture data directly (`mock-tools.ts`, `mock-data.ts`'s `sources`) — the
only place in the execution path that does. **`Agent` no longer does, as of Phase 2**
(below): `MockAgentRuntime` resolves through `AgentRepository` instead. Swapping a mock
for a real provider still means replacing one of these four classes — nothing upstream
changes.

**Runtime provenance and version pinning (Phase 2 of
`documentation/agent-model-implementation-plan.md`)** — `AgentRequest`/`AgentResult`
gained `agentVersionId`; `MockAgentRuntime` resolves the pinned `AgentVersion` snapshot
via `AgentRepository.getVersion(agentVersionId)` (never a fresh agentId lookup, never
the live draft), and its response text now visibly depends on the resolved version's
`instructions.Identity` rather than purely echoing the workflow node's instruction.
`runConversationSession` (`lib/conversation-runtime.ts`) resolves one immutable
`AgentVersion` per distinct agent the workflow's nodes reference — once, before
`session.opened`/`run.started` are even emitted, via
`AgentRepository.getPublishedVersion` — and fails explicitly (rejects, before any event
is recorded) if an agent doesn't exist or was never published. That resolution is
pinned: `ExecutionRecorder.setProvenance` stamps every subsequent event's
`workflowId`/`workflowVersion` (always) and `agentId`/`agentVersionId` (when the
workflow references exactly one distinct agent) onto `EventIdentity`, and throws if
called after the first event — publishing a new version mid-session can never
retroactively change what's already on the stream. `EventIdentity.agentId`/
`agentVersionId` are a **single-agent convenience view only** — present solely when the
workflow references exactly one distinct agent — not the source of truth for
provenance in general: the complete, canonical record is `run.started`'s own
`agentVersions: Record<string, string>` payload field, the full agentId → pinned
`AgentVersion` id binding for every agent the workflow's nodes reference, captured
once at session start regardless of which nodes a given run actually visits (an
untaken decision branch's agent is still bound there even though it never produces its
own `agent.started`/`agent.responded`). `agent.started`/`agent.responded` additionally
carry their own per-node `agentId`/`agentVersionId` on the event payload, so a
multi-agent workflow gets correct per-node provenance too — but reconstructing "what
did this run pin for every agent it could have used" requires `run.started.agentVersions`,
not just those per-node events, precisely because a node that's never visited never
emits one. A projection can recover this from the event stream alone, without
consulting `AgentRepository` (mutable, forward-moving) or the live draft. `Agent`'s ten
legacy fixture fields (`lib/mock-data.ts`) are **not** what `AgentRuntime` resolves
through anymore; every Agent *configuration* screen now reads/writes the canonical
repository instead (Phase 3A/3B, below) — the fixture remains read only by
`workflow-detail.tsx`, `tool-detail.tsx`, and the dashboard page, for display fields
the canonical model doesn't carry, which were never in the Agent Model plan's scope.

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

## Architecture Milestones

What's actually been built, in roughly the order it landed. This is a cumulative
record, not a status snapshot — see `documentation/current-state.md` for current status
and what's not built yet.

- **Workflow Definition** — the pure, serializable graph model: typed nodes/edges,
  input/output bindings, structured (non-`eval`) predicates (`lib/mock-workflows.ts`,
  `lib/workflow-predicates.ts`).
- **Execution Engine** — `consultWorkflow`, the consultation-based execution primitive,
  and the stable per-node-kind `NodeExecutor` contract (`lib/workflow-consultation.ts`,
  `lib/workflow-executors.ts`).
- **Event Sourcing** — the immutable, append-only `ExecutionEvent` stream and
  `ExecutionRecorder`, with compositional correlation ids and a `durability` class
  (`lib/workflow-events.ts`).
- **Projection Layer** — pure functions folding the event stream into every read model
  (path, context, state transitions, tool calls, conversation, turns), with no parallel
  data structures to keep in sync (`lib/workflow-projections.ts`).
- **Runtime Interfaces** — the four async provider contracts (Agent/Tool/Knowledge/
  Channel) and their deterministic mock implementations, the sole fixture readers in
  the execution path (`lib/runtime/contracts.ts`, `lib/runtime/mock-runtime.ts`).
- **Conversation Runtime** — `MockConversationRuntime`, owning sessions, turns, time,
  and interruption as a layer deliberately separate from the engine; cursor-based
  consultation resumption; scripted multi-turn scenarios including one interruption
  case (`lib/conversation-runtime.ts`, `documentation/conversation-runtime-design.md`).
- **ConversationTurn model** — the canonical turn-lifecycle domain type
  (`lib/conversation-types.ts`), and the naming split that keeps it from colliding with
  `workflow-context.ts`'s simpler flat transcript shape, renamed `TranscriptLine`.
- **projectTurns projection** — folds `conversation.turn`/`turn.interrupted`/
  `directive.abandoned`/`intent.detected` into `ConversationTurn` records, correlated
  per consultation; the first tested projection in the codebase
  (`workflow-projections.test.ts`).
- **Turns UI** — the Turns tab in the workflow run panel, consuming `projectTurns`
  through the same projection boundary every other tab uses
  (`components/workflows/workflow-run-panel.tsx`).
- **Agent Model (design)** — an approved design record for the target Agent data
  model, naming the ownership direction correction (Agent should own its Workflow
  references, not the reverse) and a capability-vs-invocation split for tools/knowledge
  bindings; not yet implemented (`documentation/agent-model-design.md`).
- **Unified Conversation Execution Path** — the agent testing panel now drives a real
  consultation through `MockConversationRuntime`/`consultWorkflow` via a pluggable
  `StimulusSource`, instead of the disconnected `setTimeout`-based fake chat it ran
  previously. Exactly one execution path now exists for any conversation in this
  codebase (`components/agent-testing-panel.tsx`; see the invariant in "Conversation
  Runtime: owns time, not policy" above).
- **Conversation Runtime stabilization** — real cancellation (`StimulusSource.cancel`,
  wired to the agent testing panel's End action via a generation-token guard); a
  truthful `SessionEndReason` for every way a session can stop (`run()` never rejects);
  a `ConsultationOutcome` vocabulary so a malformed graph is never reported as a
  successful completion; stable `turnId`s and correct causality (a caller turn, not the
  pause before it, is the next consultation's causal parent); request/start
  instrumentation events moved before the provider `await` instead of after; tool
  `status`/`error` preserved through to `tool.returned`; and `runConversationSession`,
  the one shared envelope both the "Run test" button and agent testing now call
  (`lib/conversation-runtime.ts`, `lib/workflow-consultation.ts`).
- **Agent Model (repository layer)** — Phase 1 of
  `documentation/agent-model-implementation-plan.md`: canonical `Agent`/`AgentVersion`
  types, an `AgentRepository` with a `LocalAgentRepository` implementation (draft is
  always exactly one and always resolvable; publishing snapshots a new immutable
  version and never mutates a prior one), and a pure, deterministic migration seeding
  the 4 fixture agents into that shape (`lib/agent-model.ts`, `lib/agent-repository.ts`,
  `lib/agent-migration.ts`). The Agent Versioning decision this implements is now
  recorded in `agent-model-design.md` §9.
- **Agent Model (runtime provenance)** — Phase 2 of
  `documentation/agent-model-implementation-plan.md`: the execution engine now actually
  reads the Phase 1 repository. `runConversationSession` resolves and pins one
  published `AgentVersion` per agent the workflow references, once, before a session
  starts; `MockAgentRuntime` resolves through it (see "Runtime Interfaces" above); every
  event on the run carries immutable `workflowId`/`workflowVersion` provenance and,
  where applicable, `agentId`/`agentVersionId`, unaffected by a version published
  mid-session. A follow-up audit found that representation alone was insufficient for
  multi-agent workflows (a run's complete agent→version binding wasn't durably
  recoverable from the event stream) — closed by adding `run.started.agentVersions`,
  the complete binding, always present regardless of which nodes a run visits (see
  "Runtime Interfaces" above). UI screens still read the old `mock-data.ts` fixture for
  display — that's Phase 3.
- **Agent Model (Phase 3A — canonical draft + Builder migration)** — the first UI
  screens now read/write the Phase 1 repository instead of fixtures. Agent listing,
  detail loading, and creation (`hooks/use-agent-data.ts`) all resolve by stable
  `agentId` through the one shared `getDefaultAgentRepository()` singleton — never a
  second instance per component/hook/route. Agent creation (`app/(platform)/agents/new`)
  writes a canonical `Agent` + empty draft, never auto-published. Of `structured-editor.tsx`'s
  9 Configuration sub-tabs, **7** — Identity, Personality, Conversation Rules, Transfers,
  Memory, Guardrails, Output Schema — now read/write the canonical draft via explicit
  save (edits stage in local component state; "Save changes" writes the whole patch in
  one `updateDraft` call; a published `AgentVersion` is never mutated). **Knowledge and
  Tools stay on `stores/agent-builder-store.ts`** — deliberately excluded from this
  pass (see that file's own header comment for the exact removal condition) since those
  names overlap with the separately-scoped `Agent.knowledgeSourceIds`/`toolIds`
  capability work, not touched here. Prompt Studio, the Tools/Knowledge top-level tabs,
  publishing, and version history remain entirely on their pre-existing (disconnected
  or fixture-backed) implementations — this is not the full Agent configuration path
  unified, only Builder identity/personality/rules/transfers/memory/guardrails/output
  schema. `lib/mock-data.ts`'s `agents` fixture is untouched and still read directly by
  `workflow-detail.tsx`, `tool-detail.tsx`, and the dashboard page — none of those were
  in scope.
- **Agent Model (Phase 3B — canonical configuration path complete)** — every remaining
  Agent configuration screen now reads/writes the Phase 1 repository. `agent-prompt-studio.tsx`
  takes an explicit `agentId` prop (no more independent local state) and edits the same
  draft as the Configuration tab, using the same explicit-save staging Phase 3A
  established; its 8-section authoring vocabulary maps onto the canonical 14
  `InstructionSection`s per `agent-model-implementation-plan.md` §11's documented
  mapping. The standalone `/prompt-studio` route is now an Agent-selection launcher —
  it holds only the current selection, never prompt state, and never defaults to an
  implicit first agent. `structured-editor.tsx`'s Knowledge/Tools free-text sections
  join the other 7 on the canonical draft, retiring `stores/agent-builder-store.ts`
  entirely (deleted, not just narrowed — its removal condition from Phase 3A is now
  met). The top-level Knowledge/Tools tabs (`agent-detail-workspace.tsx`) now read/write
  `Agent.knowledgeSourceIds`/`toolIds` — the *capability* lists, referenced by the
  stable ids `lib/mock-data.ts`'s `sources` and `lib/mock-tools.ts`'s `tools` already
  carry, distinct from the free-text policy sections of the same name inside
  Configuration. Publishing (`lib/agent-publish.ts`'s `publishAgentDraft`) validates the
  draft before ever calling `repository.publish`, so a failed publish creates no
  version at all. The Versions tab reads real `AgentRepository.listVersions` history
  (no more hardcoded rows); editing/publishing/rollback stay concentrated on Prompt
  Studio as the one canonical editing surface, per the design doc's own §5 decision.
  Rollback (`rollbackDraftToVersion`) copies an immutable version's full config into the
  draft without mutating it — a later explicit publish is required to snapshot the
  rolled-back draft as a new version. `AgentTestingPanel` now explicitly resolves
  `getPublishedVersion(agentId)` itself before allowing a test to start (gating on, and
  displaying, the same published `AgentVersion` the runtime pins per Phase 2 — see
  "Runtime provenance and version pinning" above), with an honest empty state when an
  agent has never been published; it deliberately does not add a "test the draft" mode,
  since that would require overriding Phase 2's pinning resolution, which stays
  unchanged. `lib/mock-data.ts`'s `agents` fixture is still read directly by
  `workflow-detail.tsx`, `tool-detail.tsx`, and the dashboard page — unrelated Calls/
  dashboard/workflow-detail migrations, explicitly out of this phase's scope.

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
case. Phase 4 is now mostly done too: `projectTurns` exists and is tested
(`workflow-projections.test.ts`, the first test suite in this repo — see the `test`
script and `vitest.config.ts`) and **is wired into the workflow run panel** as the
Turns tab. The one thing still open within phase 4 is `invocationId`-based tool-call
pairing, for when tools stop being purely synchronous. Explicitly not started by
design, and not to be started without a fresh scoping pass: a graph-authoring/editing
canvas, real voice streaming, backend persistence, multi-tenant infrastructure.

Outside the Conversation Runtime design doc's own phase list, two more milestones have
landed: an approved Agent Model design record, and the unification of agent testing
onto the real Conversation Runtime (see Architecture Milestones above). With that
unification done, **the next major architectural milestone is the Calls domain** —
migrating `CallRecord` (`lib/mock-calls.ts`) from a hand-authored fixture model onto a
real projection of the event stream, per the resolution direction already named in
Known architectural debt above. See `documentation/current-state.md` for the fuller
rationale.
