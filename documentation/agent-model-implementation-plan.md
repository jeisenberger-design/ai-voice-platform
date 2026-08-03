# Agent Model — Implementation Plan

Status: **Proposed** (planning only — no application code changed in this pass)
Scope: frontend/mock only. Extends `documentation/agent-model-design.md`'s approved
target model with the draft/publish/versioning mechanics that document explicitly
left as a named, unresolved gap (see §4 below) — this plan makes that decision.

## 1. Every current Agent representation

| # | Representation | File | Shape |
|---|---|---|---|
| 1 | `Agent` fixture | `lib/mock-data.ts:4-15` | `{ id, name, purpose, voice, promptVersion, model, calls, successRate, status, updated }` |
| 2 | `AgentBuilderConfig` | `stores/agent-builder-store.ts:20-25` | 14 free-text `BuilderSection`s + `voice`/`pace`/`interruptionSensitivity`. Zustand `persist` → **localStorage**, key `relay-agent-builder-${agentId}` |
| 3 | `AgentPromptStudio`'s local state | `components/agent-prompt-studio.tsx:6-8` | A **different** 8-section list (`Identity, Greeting, Conversation Rules, Knowledge Instructions, Emergency Rules, Transfer Rules, Data Collection, Output Schema`) + a hardcoded `versions` array. Plain `useState`, no persistence, no `agentId` prop at all |
| 4 | `ToolsPanel`'s local state | `components/agent-detail-workspace.tsx` (`ToolsPanel` fn) | Hardcoded toggle list `['Calendar availability', 'CRM lookup', 'Create lead', 'Send follow-up']`, `useState`, no persistence |
| 5 | `KnowledgePanel`'s static markup | `components/agent-detail-workspace.tsx` (`KnowledgePanel` fn) | Not even `useState` — three hardcoded `<div>`s, string literals only |
| 6 | `VersionsPanel`'s static markup | `components/agent-detail-workspace.tsx` (`VersionsPanel` fn) | Hardcoded 3-row array, no store |
| 7 | `Tool.usedByAgents` | `lib/mock-tools.ts:29` (and each tool record) | Reverse pointer: which agent ids use this tool — a **seventh** fragment, inverse of (4) |
| 8 | `Workflow.agentIds` | `lib/mock-workflows.ts:60` | Reverse pointer: which agents participate in this workflow — the ownership inversion `agent-model-design.md` §3 already named |
| 9 | `AgentRequest`/`AgentResult` | `lib/runtime/contracts.ts:21-39` | The only representation the **runtime actually consumes** — see §3 |

Representations 2–6 are exactly the fragmentation `agent-model-design.md` §1
catalogued. One correction to that document, found while re-reading the current
code: §1's table says `AgentTestingPanel`"reads exactly one field, `sections.Purpose`"
from (2) — **that's now stale**. The Conversation Runtime stabilization pass removed
`AgentTestingPanel`'s `useAgentBuilderStore` import entirely; it no longer reads (2)
at all today. `agent-model-design.md` should get a one-line correction once this plan
lands (not in this pass — documentation-only, standalone commit, per this task's
constraints).

Two more gaps found that block part of the approved design, not just describe it:

- **Knowledge sources have no stable id.** `lib/mock-data.ts`'s `sources` array
  (`{ name, type, chunks, updated }`) and `Workflow.knowledgeSources: string[]` both key
  by **name**, not id. `agent-model-design.md` §2 proposes
  `Agent.knowledgeSourceIds: string[]` "referencing types that already exist" — but no
  id exists to reference. This must be resolved (mint a stable `id` on `sources`) before
  that field can be implemented as literally specified.
- **The standalone `/prompt-studio` route has no agent binding.**
  `app/(platform)/prompt-studio/page.tsx` renders `<AgentPromptStudio />` with zero
  props — the same component the per-agent "Prompt Studio" tab renders. Under a
  canonical, versioned model, editing and publishing must target a specific `agentId`.
  This route cannot function correctly without one. See §11 (Risks).

## 2. Screens and runtime paths per representation

| Representation | Read by | Written by |
|---|---|---|
| (1) `Agent` fixture | `useAgents()` → dashboard, `/agents` list, `agent-detail-workspace.tsx` (name/purpose/voice/status everywhere), `agent-testing-panel.tsx` (display name, workflow lookup), `MockAgentRuntime.respond()` | Nothing — read-only fixture |
| (2) `AgentBuilderConfig` | `structured-editor.tsx`, `agent-validation.ts` | `structured-editor.tsx` (`updateSection`/`updateSetting`/`save`/`discard`) |
| (3) `AgentPromptStudio` state | Itself only | Itself only (`setActive`/`setSelected`/`setPublished`/`setCompare`) |
| (4) `ToolsPanel` state | Itself only | Itself only (`setTools`) |
| (5) `KnowledgePanel` markup | Itself only | Nothing (static) |
| (6) `VersionsPanel` markup | Itself only | Nothing (static) |
| (7) `Tool.usedByAgents` | Tools registry list/detail display only | Nothing (fixture) |
| (8) `Workflow.agentIds` | `workflow-detail.tsx`'s "Connections" panel, `agent-testing-panel.tsx`'s workflow lookup | Nothing (fixture) |
| (9) `AgentRequest`/`AgentResult` | `MockAgentRuntime.respond()` (`lib/runtime/mock-runtime.ts:35-56`) | Constructed once, in `lib/workflow-executors.ts`'s `agent` executor |

## 3. What the Conversation Runtime actually consumes

**Representation (1) only, and only three of its ten fields.** The `agent` `NodeExecutor`
(`lib/workflow-executors.ts`) reads `node.ref.id` (an agent id, from the *workflow*
definition, not from any Agent representation) and calls
`runtime.agent.respond({ agentId, instruction: node.label, context, meta })`.
`MockAgentRuntime.respond()` (`lib/runtime/mock-runtime.ts:35-56`) looks the id up in
`mock-data.ts`'s `agents` array and echoes back `promptVersion`/`model`/`voice` — but
`text: request.instruction`, i.e. **the response text is the workflow node's static
label, never anything from the Agent record itself.** None of representations
(2)–(6) — the ones that actually hold personality, rules, knowledge, tools, guardrails
— reach the runtime in any form today. This is the concrete gap requirement 5 below
closes.

## 4. Differences between the approved design and current code

Two kinds of "difference," and they need different handling:

**A. Gaps `agent-model-design.md` already named and deferred** (not conflicts — expected,
now being resolved by this plan):
- §7: "Real prompt-version history storage — named as a gap in §5, not resolved here."
  **This is exactly what requirements 2 and 6 of this task ask for.** This plan makes
  that decision (§6 below); `agent-model-design.md` should be amended afterward to mark
  it resolved (a future documentation-only commit, not this one).
- §7: "The `Workflow.agentIds` → `Agent.workflowIds` data migration — named as the
  correct direction... not executed here." **Still not executed in this plan.** The
  current task doesn't ask for it, and doing it alongside a versioning migration would
  conflate two unrelated risks. `Agent.workflowIds` will exist on the canonical type
  (per §2 of the design doc) and be populated from `Workflow.agentIds` at migration
  time (read-only derivation), but `Workflow.agentIds` itself is not removed or
  inverted in this pass.
- §7: guardrail enforcement, output schema validation, memory, agent-initiated tool
  use — all still explicitly out of scope; the canonical type carries these fields as
  inert strings/ids exactly as §2 specified, no engine behavior added.

**B. A genuine naming conflict this plan must resolve**: `Agent.status` in the current
fixture (`'Active' | 'Draft' | 'Paused'`) is an **operational** concept (is this agent
live/paused). The new `AgentVersion.status` (`'draft' | 'published'`) is a
**version-lifecycle** concept. These must not collide on one field name. Resolution:
keep them on separate types with distinct field names (`Agent.status` stays
operational; `AgentVersion.status` is new and separate) — see §5.

**C. A vocabulary conflict this plan must resolve**: `AgentPromptStudio`'s 8 sections
(`Greeting, Emergency Rules, Data Collection`, ...) don't map 1:1 onto
`AgentBuilderConfig`'s 14 (`agent-model-design.md` §8's chosen seed for the canonical
`InstructionSection` vocabulary). See §11 (Risks) for the proposed mapping.

## 5. Canonical types to introduce

New file: `lib/agent-model.ts`.

```ts
export type InstructionSection =
  | 'Identity' | 'Description' | 'Purpose' | 'Personality' | 'Language'
  | 'Behavior Rules' | 'Conversation Rules' | 'Knowledge' | 'Tools' | 'Transfers'
  | 'Memory' | 'Guardrails' | 'Output Format' | 'Output Schema';
// = AgentBuilderConfig's BuilderSection today, renamed to match agent-model-design.md
// §2's "instructions" naming. This is the seed vocabulary that document already chose.

export type AgentVersionConfig = {
  instructions: Record<InstructionSection, string>;
  voice: string;
  model: string;
  workflowIds: string[];        // design doc §3 — ownership direction correction
  knowledgeSourceIds: string[]; // design doc §4 — capability, not invocation
  toolIds: string[];            // design doc §4 — capability, not invocation
  transferPolicy: string;       // design doc §2
  memory: string;               // design doc §2 — inert string, no engine semantics
  guardrails: string;           // design doc §2 — inert string, no enforcement point
  outputSchema: string;         // design doc §2 — inert string, no validation
};

export type AgentVersion = AgentVersionConfig & {
  versionId: string;   // deterministic — see §6
  agentId: string;
  versionNumber: number; // 1, 2, 3... published versions only; a draft has none
  status: 'draft' | 'published';
  createdAt: number;    // deterministic simulated/logical clock — see §6, not Date.now()
  publishedAt?: number;
};

export type Agent = {
  agentId: string;     // stable — preserved from today's a1/a2/a3/a4
  name: string;
  status: 'Active' | 'Draft' | 'Paused'; // operational — see §4.B, distinct from AgentVersion.status
  draftVersionId: string;      // always present — every agent always has exactly one open draft
  publishedVersionId?: string; // absent until the first publish
  createdAt: number;
};
```

No field here isn't already named in `agent-model-design.md` §2. Nothing speculative
added (no realtime-transcription config, no billing, no eval schema beyond the inert
`outputSchema` string already approved).

## 6. Draft, publishing, immutable versioning, runtime snapshot

- **Draft is always exactly one, always exists.** `Agent.draftVersionId` is never
  null — an agent with no edits yet has a draft that's a byte-for-byte copy of its
  published version (or of the seed defaults, if never published).
- **Editing never touches a published `AgentVersion`.** All `structured-editor.tsx` /
  `agent-prompt-studio.tsx` writes go through
  `repository.updateDraft(agentId, patch)`, which only ever mutates the record at
  `agent.draftVersionId`.
- **Publishing** (`repository.publish(agentId)`):
  1. Reads the current draft's `AgentVersionConfig`.
  2. Computes the next `versionNumber` = `1 + (highest existing published versionNumber
     for this agentId, or 0)`. Deterministic and testable: given the same prior
     version count, the same number always results — no randomness, no wall clock in
     the number itself.
  3. Creates a **new** `AgentVersion` record — `status: 'published'`, the computed
     `versionNumber`, `versionId` = `${agentId}-v${versionNumber}` (deterministic,
     collision-proof per agent).
  4. Sets `Agent.publishedVersionId` to the new version's id.
  5. **Does not touch or overwrite the previous published version** — it remains in
     the repository, listed by `repository.listVersions(agentId)`, fully readable.
  6. Leaves `Agent.draftVersionId` pointing at the *same* draft record (now identical
     in content to the version just published, until the next edit diverges it) —
     matches how `AgentBuilderConfig.save()` already behaves conceptually (draft
     equals last-saved until touched again), just now producing a real immutable
     artifact instead of overwriting one mutable blob.
- **Runtime snapshot resolution**: `AgentTestingPanel` and any future execution path
  resolve `repository.getPublishedVersion(agentId)` **once**, at session start, and
  pass that `AgentVersion`'s id (and, for the mock provider, its config) into the
  session. A version published *during* an in-flight session must not affect it — see
  §8 for how that's enforced structurally, not just by convention.

## 7. Repository interface and local persistence adapter

New file: `lib/agent-repository.ts`.

```ts
export interface AgentRepository {
  listAgents(): Promise<Agent[]>;
  getAgent(agentId: string): Promise<Agent | null>;
  getVersion(versionId: string): Promise<AgentVersion | null>;
  getDraft(agentId: string): Promise<AgentVersion>;
  updateDraft(agentId: string, patch: Partial<AgentVersionConfig>): Promise<AgentVersion>;
  listVersions(agentId: string): Promise<AgentVersion[]>; // newest first
  getPublishedVersion(agentId: string): Promise<AgentVersion | null>;
  publish(agentId: string): Promise<AgentVersion>;
  createAgent(input: { name: string; status?: Agent['status'] }): Promise<Agent>;
  // No UI calls this yet (agent creation is a placeholder — app/(platform)/agents/new/page.tsx).
  // Included now so the interface is complete and the repository doesn't need a
  // breaking change the day creation gets built.
}
```

**Local adapter**: `LocalAgentRepository`, backed by **localStorage** — this is a
deliberate choice, not the path of least resistance. `AgentBuilderConfig` already
persists to localStorage today; an in-memory-only repository would be a *regression*
(config no longer survives a page refresh). One JSON blob under key
`relay-agent-repository-v1` (all agents + all versions), read into an in-memory cache
on construction, written back on every mutation. Seeded from migrated fixture data
(§9) on first load if the key is empty. This satisfies "keep persistence behind a
repository interface... use the repository's existing local/mock storage approach" —
the *existing* approach in this codebase for agent config specifically is
Zustand-persist-to-localStorage; `LocalAgentRepository` generalizes that same
mechanism to the canonical shape instead of introducing a new persistence idiom
(e.g. IndexedDB) with no precedent here.

**Backend-swap seam**: every product screen calls the `AgentRepository` interface via
React Query hooks (`use-agent-data.ts`, new), never `LocalAgentRepository` directly —
identical seam to `lib/mock-api.ts` → `hooks/use-platform-data.ts` already established
for CRUD data. Swapping in a real backend repository later means implementing the same
interface and changing one factory function, per `frontend-architecture.md`'s existing
CRUD-integration path.

## 8. Exact files to add, modify, migrate, remove

**New:**
- `lib/agent-model.ts` — canonical types (§5).
- `lib/agent-repository.ts` — `AgentRepository` interface + `LocalAgentRepository`.
- `lib/agent-migration.ts` — pure function migrating `mock-data.ts`'s 4 agents +
  `AgentBuilderConfig`'s default section text into canonical `Agent`/`AgentVersion`
  seed records (§9).
- `hooks/use-agent-data.ts` — `useAgent`, `useAgentDraft`, `useAgentVersions`,
  `useUpdateAgentDraft`, `usePublishAgent`.
- `lib/agent-repository.test.ts`, `lib/agent-migration.test.ts` — see §10.

**Modified:**
- `lib/runtime/contracts.ts` — `AgentRequest` gains `agentVersionId: string` (the
  runtime needs to know *which* version it's resolving); `AgentResult` unchanged
  structurally, but its values now come from the resolved version, not the fixture.
- `lib/runtime/mock-runtime.ts` — `MockAgentRuntime.respond()` resolves via
  `AgentRepository.getVersion(agentVersionId)` instead of `mock-data.ts`'s `agents`
  array; response text visibly depends on `instructions.Identity`/`Personality`
  instead of pure-echoing `request.instruction` (still fully deterministic/mocked —
  requirement 5 asks for *visible dependency*, not real generation).
- `lib/workflow-executors.ts` — the `agent` executor's call to `runtime.agent.respond`
  gains `agentVersionId`, resolved from the run's pinned provenance (§ below), not
  re-resolved per call.
- `lib/workflow-events.ts` — `EventIdentity` gains `agentId?: string`,
  `agentVersionId?: string`, `workflowVersion?: number`, stamped once by
  `ExecutionRecorder` at construction (same treatment `sessionId`/`runId` already get)
  so every event in a run carries them, unchanged for the run's lifetime regardless of
  what publishes later.
- `lib/conversation-runtime.ts` (`runConversationSession`) — resolves the run's
  provenance (agentId/agentVersionId/workflowId/workflowVersion) once, before
  constructing the `ExecutionRecorder`, per §9's "captured at run start, unchanged
  throughout" requirement.
- `lib/workflow-execution.ts` — threads provenance resolution through
  `simulateWorkflowRun` the same way.
- `stores/agent-builder-store.ts` — **removed**. Superseded by
  `repository.getDraft`/`updateDraft`.
- `lib/agent-validation.ts` — validates `AgentVersionConfig` instead of
  `AgentBuilderConfig`; same 4 required sections, same severity logic.
- `components/structured-editor.tsx` — reads/writes via `useAgentDraft`/
  `useUpdateAgentDraft` instead of `useAgentBuilderStore`. UI unchanged.
- `components/agent-prompt-studio.tsx` — gains an `agentId` prop; section list
  remapped onto the canonical 14 (§11 mapping); "Publish" calls `usePublishAgent`;
  version history list becomes real (`useAgentVersions`). UI layout unchanged.
- `app/(platform)/prompt-studio/page.tsx` — needs an `agentId` to pass through; see
  §11 (Risks) for the open question this raises.
- `components/agent-detail-workspace.tsx` — `ToolsPanel`/`KnowledgePanel` read/write
  `draft.toolIds`/`draft.knowledgeSourceIds` via the same hooks instead of local
  `useState`/static markup; `VersionsPanel` reads `useAgentVersions`; "Configuration
  health" checklist in `Overview` reads real `validateAgentConfig` output. UI layout
  unchanged.
- `components/agent-testing-panel.tsx` — resolves
  `repository.getPublishedVersion(agentId)` once at `beginSession()`, passes
  `agentVersionId` into the session's provenance; falls back to the existing
  "no workflow attached" empty state additionally covering "no published version yet."
- `lib/mock-api.ts`, `hooks/use-platform-data.ts` — `listAgents`/`useAgents` read
  through the repository instead of re-exporting `mock-data.ts`'s `agents`.
- `lib/mock-data.ts` — `Agent` type and `agents` array **removed**; `metrics`,
  `activity`, `weeklyCalls`, `sources` stay (unrelated to the Agent model), except
  `sources` gains a stable `id` field (§1's knowledge-source gap).

**Not modified** (explicitly, per this task's boundary and `agent-model-design.md`'s
own deferrals): `lib/mock-workflows.ts`'s `Workflow.agentIds` (read, not inverted or
removed), `lib/mock-tools.ts`'s `Tool.usedByAgents` (display-only, left as-is),
anything under `components/calls/`, `lib/mock-calls.ts`, any backend/auth/telephony
path.

## 9. Compatibility adapters and removal conditions

- **`lib/agent-migration.ts` itself is the only compatibility adapter needed**, and
  it's a one-time seed function, not a long-lived shim: it runs once (inside
  `LocalAgentRepository`'s constructor, only when localStorage is empty) to translate
  the 4 fixture agents into canonical records, then is never consulted again — the
  repository is the source of truth from that point forward. **Removal condition**:
  once a real backend repository exists and seeds its own data (or once local demo
  data is regenerated by hand), this file can be deleted along with the local
  adapter's seed-on-empty behavior.
- **Migrated `promptVersion` strings (`'v14'`, `'v12'`, ...) become a `legacyLabel`
  string on the seeded published `AgentVersion`, not its `versionNumber`.** Treating
  "v14" as if 14 real versions existed would fabricate a false history; the canonical
  model starts every migrated agent at `versionNumber: 1`. `legacyLabel` is kept only
  for display/debugging continuity and is not read by any logic. **Removal
  condition**: once the UI no longer shows the old label anywhere (a follow-up
  polish task), this field can be dropped.
- **No other adapter is proposed.** `agent-model-design.md` §8 already rejected
  preserving `AgentPromptStudio`/`ToolsPanel`'s local state as a parallel surface
  ("proposed for removal") — this plan follows that decision rather than shimming it.

## 10. Phased sequence, with tests after each phase

**Phase 1 — Canonical types + repository (no UI wiring yet).**
Add `lib/agent-model.ts`, `lib/agent-repository.ts`, `lib/agent-migration.ts`.
Tests: migration produces 4 agents with deterministic ids/versionIds/versionNumbers;
`updateDraft` never mutates a published version; `publish` creates a new immutable
version and never overwrites the prior one; `listVersions` returns full history;
`getPublishedVersion` returns the latest published, not the draft.

**Phase 2 — Runtime provenance.**
Extend `EventIdentity`, `AgentRequest`, `ExecutionRecorder`; update
`workflow-executors.ts`'s `agent` executor and `MockAgentRuntime.respond()`.
Tests: every event in a run carries `agentId`/`agentVersionId` when applicable; a
version published mid-run doesn't change the pinned id already on that run's events;
`MockAgentRuntime`'s response text visibly changes when a different version's
`instructions.Identity` is resolved (proves it's no longer a pure instruction-echo).

**Phase 3 — Screen wiring.**
`structured-editor.tsx`, `agent-prompt-studio.tsx` (+ its route prop gap — see §11),
`agent-detail-workspace.tsx`'s `ToolsPanel`/`KnowledgePanel`/`VersionsPanel`,
`agent-testing-panel.tsx`, `use-platform-data.ts`/`mock-api.ts`.
Tests: all these screens read/write the *same* draft (assert two "screens" driven off
the same `agentId` see each other's uncommitted edits); `AgentTestingPanel` resolves
and pins the published version at session start; a component test (or targeted unit
test on the resolution function, since this repo has no component-test harness — see
`agent-model-design.md`'s conventions) confirming resolution never falls back to the
old `mock-data.ts` fixture.

**Phase 4 — Cleanup.**
Remove `stores/agent-builder-store.ts`, `Agent`/`agents` from `mock-data.ts`. Grep the
whole tree for any remaining import of either. Tests: a repo-wide static check (or a
simple grep-based test) asserting no file imports `Agent`/`agents` from
`lib/mock-data.ts`.

**Phase 5 — Formatting-only pass.**
`pnpm run format`, isolated commit, per this session's established convention.

## 11. Risks and likely migration problems

1. **The standalone `/prompt-studio` route has no `agentId`.** Under the canonical
   model this route cannot meaningfully edit or publish anything without one.
   Options, none of which are free: (a) add a minimal agent picker (arguably a new
   screen element, in tension with "do not redesign the screens"); (b) default it to
   the first agent (silently wrong for every other agent, confusing); (c) leave it
   degraded/disabled with an explanatory empty state until a picker is explicitly
   requested. **Recommend (c)** — smallest footprint, honest about the gap, doesn't
   invent new UX unasked. Needs your confirmation before Phase 3.
2. **`AgentPromptStudio`'s 8 sections don't map 1:1 onto the canonical 14.** Proposed
   mapping: `Identity`→`Identity`, `Greeting`→`Identity` (folded in, greeting is part
   of identity/opening behavior), `Conversation Rules`→`Conversation Rules`,
   `Knowledge Instructions`→`Knowledge`, `Emergency Rules`→`Guardrails`,
   `Transfer Rules`→`Transfers`, `Data Collection`→`Output Format`,
   `Output Schema`→`Output Schema`. This is a judgment call, not a fact derived from
   either source file — flagging for explicit confirmation rather than assuming.
3. **Knowledge source ids don't exist yet.** Minting them (`lib/mock-data.ts`'s
   `sources`) is a small, additive, low-risk change, but it's technically outside
   "the Agent model" narrowly read — flagging so it isn't a surprise scope addition.
4. **Multi-agent workflow runs' provenance is ambiguous.** A `Workflow` can reference
   multiple agents across different `agent` nodes (e.g. a future escalation flow).
   "The run's agentId," singular, isn't always well-defined at the run/session level.
   Recommend: `EventIdentity.agentId`/`agentVersionId` are populated **per-event**
   (on `agent.started`/`agent.responded` and anything else naturally scoped to one
   node), and are additionally set at the **run-level** (`ExecutionRecorder`
   construction) only when a run has exactly one distinct agent across the whole
   walk — otherwise left undefined at that level rather than guessing which agent is
   "primary." `AgentTestingPanel` sessions always satisfy the single-agent case by
   construction.
5. **`AgentRequest` is a "stable" contract.** `ARCHITECTURE.md` documents the four
   runtime interfaces as the provider boundary real integrations will implement.
   Adding `agentVersionId` is additive (a new required field on a request object, not
   a signature change to the interface's shape or async nature) but is still a
   deliberate touch to a boundary this project has otherwise protected carefully —
   worth being explicit that it's happening and why, not silently done.
6. **Orphaned localStorage keys.** Removing `agent-builder-store.ts` leaves any
   existing `relay-agent-builder-${agentId}` browser keys unread and unreachable.
   Harmless (mock data, no user-facing consequence), not worth writing cleanup code
   for — noting only so it isn't mistaken for a bug later.
7. **`Agent.status` vs `AgentVersion.status` naming collision**, already resolved in
   §5/§4.B by keeping them on separate types — flagged here as the kind of thing worth
   double-checking during Phase 3 screen wiring, where both are likely to be read in
   the same component (`agent-detail-workspace.tsx`'s header badge).
8. **No component-test harness exists in this repo** (confirmed earlier this session
   — no `@testing-library/react`, no `*.test.tsx` files anywhere). Phase 3's "all
   screens address the same draft" test (requirement 9) will need to be written as a
   unit test against the resolution/hook logic, not a rendered-component test,
   consistent with this repo's existing testing convention.

## 12. Definition of done

- `lib/agent-model.ts` is the only file declaring `Agent`/`AgentVersion` types; no
  competing declaration remains anywhere (`AgentBuilderConfig` type deleted).
- Exactly one draft per agent, always resolvable; publishing always produces a new,
  distinct, previously-unseen `versionId`; the previously-published version is still
  readable via `listVersions` after a new publish.
- `structured-editor.tsx`, `agent-prompt-studio.tsx`, `ToolsPanel`, `KnowledgePanel`
  all read/write the one canonical draft for a given `agentId` — verified by a test
  that edits via one path and reads the change via another.
- `AgentTestingPanel` resolves a specific, real `AgentVersion` (not the deleted
  fixture) and that resolution is pinned for the session's lifetime.
- Every execution event that's naturally scoped to an agent (and every run-level
  event, when the run is single-agent) carries `agentId`/`agentVersionId`; a version
  published mid-run never changes an in-flight run's already-recorded provenance.
- `grep -r "from '@/lib/mock-data'" | grep -i agent` (or equivalent) returns nothing
  outside `lib/agent-migration.ts`'s one-time seed use — no other file imports the old
  `Agent`/`agents` fixture.
- `lint`, `typecheck`, `test`, `format:check`, `build` all pass.
- `documentation/current-state.md` and `ARCHITECTURE.md` accurately describe the
  landed behavior (updated only once implementation is actually complete, not in this
  planning pass).

## Explicitly not in this plan

CallRecord/Calls-domain migration, backend persistence (Postgres/Prisma), HTTP APIs,
authentication, telephony, real LLM providers, the `Workflow.agentIds` →
`Agent.workflowIds` ownership migration itself (only *read* here, not inverted), any
new product screen, agent-initiated tool use, guardrail/output-schema enforcement,
memory implementation. All per `agent-model-design.md`'s own deferrals and this task's
explicit boundary.
