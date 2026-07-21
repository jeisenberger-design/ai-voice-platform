# Conversation Runtime — Design

Status: **Approved** (design committed before implementation)
Scope: frontend/mock only. No real voice providers, no backend services.

## Purpose

The workflow engine executes a batch walk over a DAG. A phone call is a long-running,
interruptible, event-driven conversational loop. This design adds conversational runtime
capability **without** merging the two: the workflow graph remains a policy artifact,
and a new Conversation Runtime layer owns time, turns, and interruption.

- The workflow answers: *"What actions, policies, tools, and decisions apply in this situation?"*
- The conversation runtime answers: *"How does this interaction progress turn by turn?"*

## 1. Layer diagram

```
Channel Runtime            (existing contract; grows a session lifecycle:
      │                     caller events in, speak/close out)
      ▼ channel events (caller speech, hangup, DTMF)
Conversation Runtime       (NEW — owns sessions, turns, time, interruption,
      │                     directive execution)
      │ asks for responses          │ consults policy at defined moments
      ▼                             ▼
Agent Runtime               Workflow Engine ("consultation" = bounded graph walk
   (existing)                       │         from a cursor to a wait point)
                                    ▼ via NodeExecutors
                          Tool / Knowledge Runtimes (existing)
```

The inversion vs. the batch model: the engine no longer drives from trigger to end. The
**Conversation Runtime drives**; the engine is called repeatedly. Each call is a
*consultation* that advances the graph until it reaches a **wait point**, then returns
control together with directives.

## 2. ConversationSession model

One session = one live interaction (a call). The session record is itself a projection
of session events; the runtime may cache it, but the stream is truth.

```ts
type ConversationSession = {
  sessionId: string;
  orgId: string; projectId: string;               // tenancy dimension
  channel: 'voice' | 'chat' | 'sms'; provider: string;
  workflowId: string; definitionVersion: string;  // pinned snapshot
  primaryAgentId?: string;
  status: 'initializing' | 'active' | 'waiting_external' | 'transferring' | 'ended';
  endReason?: 'completed' | 'caller_hangup' | 'transferred' | 'error' | 'timeout';
  startedAt: number;                              // wall clock
};
```

`waiting_external` is the parked state for pending async tool results or timers;
resumption is event-driven.

## 3. ConversationTurn model

A turn is one contiguous contribution by one party. Turns are **not** workflow nodes.

```ts
type ConversationTurn = {
  turnId: string; sessionId: string; seq: number;
  speaker: 'caller' | 'agent' | 'system';
  origin: 'speech' | 'policy' | 'system';
  status: 'in_progress' | 'completed' | 'interrupted' | 'abandoned';
  text?: string;               // final content
  partialText?: string;        // delivered before interruption
  interruptedBy?: string;      // turnId of the interrupting turn
};
```

Cardinality rules that keep the layers honest:
- A caller turn triggers **0..n** consultations.
- A consultation may span multiple turns and may produce **0..n** agent turns (via directives).
- Agent turns are always produced by directives; the engine never creates a turn itself.

## 4. Consultation lifecycle

The consultation is the seam between the Conversation Runtime and the Workflow Engine:

```ts
type Stimulus =
  | { kind: 'session.start' }
  | { kind: 'caller.turn'; turnId: string; text: string; intent?: string }
  | { kind: 'tool.result'; invocationId: string }
  | { kind: 'timer'; timerId: string };

consultWorkflow(definition, context, stimulus, cursor):
  { status: 'paused' | 'completed'; context; directives: Directive[]; cursor: Cursor }
```

Lifecycle: `consultation.started` (with stimulus) → node executions (existing executor
contract, unchanged) → either `consultation.paused` at a wait point (cursor recorded) or
`consultation.completed`. A **wait point** is a node whose semantics require the outside
world: an agent exchange awaiting a caller reply, an async tool, a transfer hand-off, or
end. The engine never owns time — it returns directives and a cursor.

Node semantics under consultation:
- `agent` — conversational exchange: emits `speak` + `listen` directives, then **pauses**.
- `message` — one-way speak: emits `speak`, continues.
- `tool` (sync) — executed inline within the consultation (deterministic, current behavior).
- `tool` (async, future) — emits `invoke_tool` directive, pauses/continues per policy.
- `transfer` — emits `transfer` directive.
- `end` — emits `end`, completes the consultation and the session.
- The cycle guard is **per consultation**; across consultations nodes are naturally
  revisitable, which is how re-prompting emerges without cyclic definitions.

## 5. Directive model

Directives are the engine's only way to affect the world; the Conversation Runtime
executes them in the speech domain.

```ts
type Directive =
  | { kind: 'speak'; text: string; interruptible: boolean }
  | { kind: 'listen'; expecting?: string[] }
  | { kind: 'invoke_tool'; invocationId: string; toolId: string;
      inputs: Record<string, WorkflowValue>; mode: 'sync' | 'async' }
  | { kind: 'transfer'; target: string }
  | { kind: 'end'; reason: string };
```

Directive execution emits `directive.issued` / `directive.completed` /
`directive.abandoned` (interruption) events.

## 6. Cursor / resumption model

A cursor identifies where the next consultation resumes: `{ nodeId: string | null }`
(null = start at the trigger). The cursor is recorded in `consultation.paused` events,
making resumption **replayable** — session state, including the cursor, is derivable by
folding the event stream. This is continuation-style execution, deliberately
Temporal-shaped: the engine knows where to resume but never owns when.

Interruption handling: a caller barge-in during an interruptible `speak` causes
`turn.interrupted` (with `partialText` — what was actually said aloud, which matters for
context truthfulness) and `directive.abandoned` for the unexecuted remainder. The next
consultation resumes from the cursor with the interruption recorded in context. The
engine never sees interruption as control flow.

## 7. Event additions

One canonical stream (see §9). Identity extension:

```ts
type EventIdentity = {
  schemaVersion: number;       // NEW — event schema version
  sessionId: string;           // NEW — top-level correlation
  runId: string;               // one simulated run of a session
  consultationId?: string;     // NEW — per consultation
  turnId?: string;             // NEW — set for events within a turn
  eventId: string; parentEventId?: string; stepId?: string; nodeId?: string;
  seq: number;
  t: number;                   // deterministic simulated clock
  emittedAt: number;           // NEW — wall clock
  durability: 'canonical' | 'ephemeral';  // NEW — see §9
};
```

New event types (same discriminated-union approach):

| Layer | Events |
|---|---|
| Session | `session.opened`, `session.ended` |
| Turn | `turn.started`, `turn.partial`*, `turn.completed`, `turn.interrupted` |
| Understanding | `intent.detected` |
| Policy | `consultation.started`, `consultation.paused`, `consultation.completed` |
| Directive | `directive.issued`, `directive.completed`, `directive.abandoned` |

\* ephemeral durability class.

All existing events are unchanged; they now also carry `sessionId` and, where
applicable, `turnId`/`consultationId`. Correlation is compositional: `stepId` groups
within a node execution, `consultationId` groups node executions, `turnId` groups
activity within a turn, `sessionId` groups everything. `parentEventId` carries causality
(a consultation's parent is the turn event that stimulated it). Tool invoke/return pairs
gain an `invocationId` so async pairs can span steps and turns.

## 8. Relationship between Conversation Runtime and Workflow Engine

- The Conversation Runtime **owns**: sessions, turns, time, speech lifecycle,
  interruption, directive execution, the conversation scope of context, and when to
  consult the workflow.
- The Workflow Engine **owns**: policy evaluation — node execution via the unchanged
  `NodeExecutor` contract, predicate evaluation, state bindings — and returns directives
  plus a cursor. It never speaks, waits, or sleeps.
- **WorkflowContext across turns**: the session owns the context; it is threaded into
  each consultation and folded forward. Context still changes only via `state.changed` /
  `conversation.turn` events, so `fold(sessionEvents) = context` holds at all times.
  Scope ownership: `conversation` written by the Conversation Runtime, read by the
  workflow; `variables` persist for the session; `session` seeded at open; `metadata`
  records policy bookkeeping.
- The trigger node fires once, at session start. Later consultations enter via the cursor.

## 9. Decisions

| Decision | Resolution | Rationale |
|---|---|---|
| Cursor-based resumption vs intent-routed entry | **Cursor-based** for phase 1; intent-routed entry points (`on_intent` handlers) are a later *additive* definition feature | Simple, replayable, no NLU dependency; intent routing composes on top |
| One event stream vs separate conversation stream | **One canonical stream** | Two streams recreate the dual-source-of-truth problem; projections make one stream affordable; a CallRecord becomes precisely "the projection of one session's stream" |
| Sync vs async tools | **Sync tools execute inline in the consultation; async tools become directives** with `invocationId`, results return as a new stimulus | Preserves deterministic current behavior; async pairs correlate via `parentEventId`/`invocationId` across the gap |
| `turn.partial` durability | **Ephemeral by default**, coalesced into `turn.completed`/`turn.interrupted`; the durability class is on the event, so enterprise-audit persistence is a storage-policy change, not a schema change | Absorbs streaming volume without a second stream |

## Implementation phases

1. **Extend event identities + schema versioning + session/turn concepts** — additive
   vocabulary and identity fields; no behavior change.
2. **Consultation-based execution with cursor support** — `consultWorkflow` extracted;
   the batch simulator becomes the degenerate case (auto-advance, single consultation)
   so existing UI stays green.
3. **MockConversationRuntime with scripted multi-turn scenarios** — deterministic
   scripted caller turns per workflow, including one interruption scenario; agent nodes
   become real wait points.
4. **Projections/UI** — Turns projection and tab, transcript from turn events,
   `invocationId` tool-call pairing, seq-based event reveal.

## Explicitly preserved

Workflow definition model (nodes/edges/bindings/predicates — acyclic, pure data) ·
`NodeExecutor` contract · Agent/Tool/Knowledge runtime contracts (Channel grows along
its existing axis) · projection architecture · `state.changed`-only context mutation ·
read-only graph UI.
