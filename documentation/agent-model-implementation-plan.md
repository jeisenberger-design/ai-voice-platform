# Agent Model — Implementation Plan

Status: **Phases 1–2 landed; Phase 3 split into 3A (landed) and 3B (not started)**.
Phase 3A is canonical draft plumbing + Agent Builder migration only — Prompt Studio,
Tools, Knowledge, and publish/version-history UI are explicitly Phase 3B, not this
pass. Phases 4–5 still proposed, not implemented. Extends
`documentation/agent-model-design.md`'s approved target model with the draft/publish/
versioning mechanics that document explicitly left as a named, unresolved gap (see §4
below) — this plan makes that decision, now recorded as its own approved addendum in
`agent-model-design.md` §9.

**Phase 1, as implemented:** `lib/agent-model.ts`, `lib/agent-repository.ts`,
`lib/agent-migration.ts`, plus `lib/agent-repository.test.ts` and
`lib/agent-migration.test.ts`. `lib/mock-data.ts`'s `sources` gained a stable `id`
field (see §1's knowledge-source-id gap, and §11 risk 3 — resolved as part of this
phase rather than deferred, since `AgentVersionConfig.knowledgeSourceIds` cannot
reference anything without it).

**Phase 2, as implemented:** runtime provenance and version pinning only — no Agent
Builder/Prompt Studio/Tools/Knowledge/Calls migration, no backend/auth/telephony.

- `lib/workflow-events.ts` — `EventIdentity` gains `workflowId`/`workflowVersion`
  (always present) and `agentId`/`agentVersionId` (present only when the workflow
  references exactly one distinct agent — see §11 risk 4). New exported `RunProvenance`
  type, documented explicitly as a **single-agent convenience view, not the source of
  truth** for multi-agent runs. `ExecutionRecorder` gains `setProvenance(provenance)`,
  callable only before the first `emit()` (throws otherwise), stamped onto every
  subsequent event. `agent.started`/`agent.responded` payloads gain their own
  `agentVersionId` (`'unknown'` sentinel when unresolved — the same treatment
  `promptVersion`/`model`/`voice` already used), giving correct per-node provenance for
  any agent actually invoked. **`run.started`'s payload gains `agentVersions: Record<
  string, string>`** — the complete agentId → pinned `AgentVersion` id binding for
  *every* agent the workflow's nodes reference, regardless of which nodes a given run
  actually visits. This landed one day after the rest of Phase 2, from a dedicated
  provenance audit (see below): the per-node events and the single-agent
  `EventIdentity` default together were *not* sufficient to reconstruct a multi-agent
  run's complete binding purely from the event stream — an agent referenced only by an
  untaken decision branch would never appear anywhere on the stream. `run.started`
  closes that gap; it is the canonical record, and everything else is a convenience
  view over the same resolution.
- `lib/runtime/contracts.ts` — `AgentRequest` gains `agentVersionId: string`;
  `AgentResult` gains `agentVersionId: string` (echoed back from whatever resolved).
- `lib/runtime/mock-runtime.ts` — `MockAgentRuntime` takes an injected `AgentRepository`
  (default: the new shared singleton, see below) and resolves
  `repository.getVersion(request.agentVersionId)` instead of `mock-data.ts`'s `agents`
  array; falls back to the pre-Phase-2 "unknown" shape (echoing the instruction) when
  unresolved, preserving every pre-Phase-2 test's behavior unchanged. Response text is
  now `` `${instructions.Identity} ${instruction}` `` — deterministic, and demonstrably
  dependent on the resolved version, not a pure echo. `createMockRuntime` gains an
  `{ agentRepository? }` option.
- `lib/agent-repository.ts` — new `getDefaultAgentRepository()`, a lazily-constructed
  shared singleton (mirrors the `nextRunId`/`nextSessionId` module-counter pattern
  already in this codebase) so callers that don't inject a repository still share
  consistent state.
- `lib/workflow-executors.ts` — `ExecutionInput` gains `agentVersionId?: string`,
  threaded in by `consultWorkflow` (not looked up by the executor itself); the `agent`
  executor forwards it into `AgentRequest`.
- `lib/workflow-consultation.ts` — `ConsultWorkflowInput` gains
  `pinnedAgentVersions?: Record<string, string>` (agentId → versionId; defaults to `{}`
  for callers that don't opt in, e.g. `workflow-consultation.test.ts`'s direct calls).
  Reused for both the pre-emitted `agent.started` and the executor's `agentVersionId`.
- `lib/conversation-runtime.ts` — `runConversationSession` is where resolution actually
  happens: `collectAgentIds` scans every node whose `ref.type === 'agent'` (mirroring
  `consultWorkflow`'s own existing gating condition exactly, not `Workflow.agentIds`,
  which can drift from real node refs); `resolveRunProvenance` resolves each one's
  `getPublishedVersion` and **throws** (before any event is recorded) if any agent
  doesn't exist or was never published — Phase 2 requirement 6's "fails explicitly."
  `MockConversationRuntime`'s constructor gains an optional `pinnedAgentVersions` param
  (default `{}`, so every pre-Phase-2 test constructing it directly is unaffected).
  `runConversationSession` gains an optional `agentRepository` param (default: the
  shared singleton).
- `lib/workflow-execution.ts` — `simulateWorkflowRun` gains an optional
  `agentRepository` param, threaded straight through.
- `lib/mock-data.ts`, `lib/runtime/mock-runtime.ts` — stale header comments corrected
  (they described `AgentRuntime` as reading `mock-data.ts`'s `Agent`, no longer true).
- `lib/conversation-runtime.test.ts` — 9 new tests (see §10); the one pre-existing test
  that calls `runConversationSession` directly (`agentWorkflow`'s `'test-agent'` id
  isn't a real, resolvable agent) now injects a repository with a real published agent,
  since that's the only path Phase 2 actually changed the resolution behavior of —
  every `MockConversationRuntime`-constructed-directly test (cancellation, causality,
  outcome truthfulness) is untouched and still passes unmodified.

**Explicitly not done in Phase 2** (Phase 3's job): no screen reads
`AgentRepository`/`AgentVersion` yet — `agent-testing-panel.tsx` is untouched and still
displays from `mock-data.ts`'s `agents`, though the sessions it drives now transparently
get real resolved provenance underneath since it already calls the now-upgraded
`createMockRuntime()`/`runConversationSession()` with no repository override (both
default to the same shared singleton). `Workflow.agentIds` is still the vehicle for
"which agent(s) does this workflow reference" — not inverted, per Phase 1's own
boundary, still correct in Phase 2.

**Phase 3A, as implemented:** canonical draft plumbing and Agent Builder migration
only — no Prompt Studio, Tools, Knowledge, backend persistence, authentication,
telephony, or analytics work in this pass.

- `hooks/use-agent-data.ts` (new) — `useAgents`, `useAgent`, `useAgentDraft`,
  `useUpdateAgentDraft`, `useCreateAgent`, all thin React Query wrappers over the one
  shared `getDefaultAgentRepository()` singleton (built in Phase 2). No
  `useAgentVersions`/`usePublishAgent` yet — nothing in this phase needs them.
- `hooks/use-platform-data.ts`, `lib/mock-api.ts` — `useAgents`/`listAgents` **removed**
  (moved to `use-agent-data.ts`, not duplicated). `mockApi.getDashboard()`'s `agents`
  field is untouched — the dashboard page bypasses hooks entirely via a pre-existing
  direct `mock-data.ts` import, out of scope.
- `lib/agent-validation.ts` — now validates `Record<InstructionSection, string>`
  directly instead of `AgentBuilderConfig`; same 4 required sections, same severity
  logic. No dependency on the legacy store's shape at all anymore.
- `components/agent-validation-summary.tsx` — takes `instructions` as a prop instead of
  reading `useAgentBuilderStore` itself.
- `components/structured-editor.tsx` — **hybrid, deliberately**: of its 9 Configuration
  sub-tabs, 7 (Identity, Personality, Conversation Rules, Transfers, Memory,
  Guardrails, Output Schema) read/write the canonical draft via new `instructions`/
  `onChangeSection` props; Knowledge and Tools keep reading/writing
  `stores/agent-builder-store.ts` exactly as before. See §11 risk 2's update below for
  why this split exists and isn't a technical-dependency violation.
- `components/agent-detail-workspace.tsx` — `useAgent(agentId)` (not a client-side
  filter over the full list) for canonical loading + not-found; `useAgentDraft`/
  `useUpdateAgentDraft` for the draft. **Save behavior decision: explicit save**, not
  autosave — edits accumulate in local component state (`staged`, a plain
  `Partial<Record<InstructionSection,string>>`, not Zustand/localStorage) and only
  reach the repository on "Save changes," as one atomic `updateDraft` call; "Discard"
  clears the stage without touching the repository. Chosen because the *visible*
  existing UI (Save/Discard buttons, an unsaved-changes badge, a beforeunload guard)
  is already an explicit-save pattern users have been trained on, and ripping it out
  for autosave would be exactly the "redesign the Agent Builder" this task forbids —
  even though the *old* Zustand store secretly persisted "unsaved" edits to
  localStorage on every keystroke regardless, so this is arguably a correctness fix
  (unsaved now genuinely means "not written anywhere") as much as a preservation.
  `agent.purpose`/`.voice`/`.calls`/`.successRate` (legacy-only fields, absent from
  the canonical `Agent` type) are replaced: the header subtitle now reads
  `draft.voice` (a real canonical field); Overview's calls/success-rate/duration stats
  show `—` placeholders with a comment pointing at the future Calls/Analytics
  projection, per this task's "do not add new legacy-fixture reads" constraint.
- `components/agent-testing-panel.tsx` — import path (`use-platform-data` →
  `use-agent-data`) and `.id` → `.agentId` only; no behavior change.
- `app/(platform)/agents/page.tsx` — reads canonical `Agent[]`; `.id` → `.agentId`;
  calls/success-rate/last-updated columns replaced with `—` placeholders (same
  reasoning as above).
- `app/(platform)/agents/new/page.tsx` — replaces the "not yet available" placeholder
  with a real form (name input + `useCreateAgent()`), navigating to
  `/agents/${agent.agentId}` on success. No publish call — matches `createAgent`'s
  existing Phase 1 behavior (draft only).
- `stores/agent-builder-store.ts` — **adapted, not removed**. Now a documented
  compatibility adapter, narrowed in practice to Knowledge/Tools (and the
  already-dead "Voice Settings" branch). See its own header comment for the precise
  removal condition (once Tools/Knowledge migrate onto the canonical draft).
- Tests: `lib/agent-validation.test.ts` (new), `hooks/use-agent-data.test.ts` (new,
  9 tests exercising the real `getDefaultAgentRepository()` singleton directly — no
  component-test harness exists in this repo, so this is the faithful proxy for
  "hooks observe shared state," per §11 risk 8's already-established convention).

**Explicitly not done in Phase 3A** (Phase 3B's job): `agent-prompt-studio.tsx` and
`app/(platform)/prompt-studio/page.tsx` — completely untouched, including the
`/prompt-studio` route's missing-`agentId` gap named in §11 risk 1 below, still
unresolved. `ToolsPanel`/`KnowledgePanel`'s top-level tab bodies — untouched, still
hardcoded local state / static markup. Knowledge/Tools *sections* within the
Configuration tab — untouched, still on the legacy store. Publishing and version
history (`VersionsPanel`) — untouched, still hardcoded; no publish button exists
anywhere in the UI yet. `lib/mock-data.ts`'s `Agent`/`agents` — not removed; still
read directly by `workflow-detail.tsx`, `tool-detail.tsx`, and the dashboard page
(`app/(platform)/page.tsx`), none of which were in scope.

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
  id exists to reference. **Resolved in Phase 1**: `sources` gained a stable, opaque
  `id` field (`ks1`/`ks2`/`ks3`), additive alongside the existing `name` — approved as
  decision #2 of the versioning/knowledge-id/prompt-studio decision set. Nothing that
  reads `source.name` today changed: `Workflow.knowledgeSources` and
  `mock-runtime.ts`'s name-based matching are untouched and out of this phase's scope.
  No fixture bound a legacy agent to a specific source, so migrated
  `Agent.knowledgeSourceIds` seed empty (§11 risk 3) rather than fabricating a binding.
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

**Phase 2 — Runtime provenance. Landed** — see the "Phase 2, as implemented" note near
the top of this document for the exact files and the resolution point
(`runConversationSession`, not `consultWorkflow` itself — the engine stays a pure
consumer of an already-resolved `pinnedAgentVersions` map). All the tests this section
named exist in `lib/conversation-runtime.test.ts`, plus explicit-failure coverage for a
missing agent/version that this section didn't originally call out but Phase 2
requirement 6 (the follow-up task that executed this phase) did.

**Phase 3 — Screen wiring. Split into 3A and 3B**, a narrowing this plan didn't
originally propose (decided at the task level, not this document, when Phase 3 turned
out too large for one coherent pass).

**Phase 3A — Landed.** Canonical draft plumbing (`hooks/use-agent-data.ts`) + Agent
Builder migration for exactly 7 of 9 Configuration sections (identity, personality,
conversation rules, transfers, memory, guardrails, output schema) + Agent creation +
canonical listing/detail loading. See the "Phase 3A, as implemented" note near the top
of this document for the exact file list, the explicit-save decision, and what's
deliberately still deferred. Tests exist in `hooks/use-agent-data.test.ts` and
`lib/agent-validation.test.ts` — written against the real shared repository singleton
directly (no component-test harness, per the existing convention this section already
anticipated) rather than rendering `structured-editor.tsx`/`agent-detail-workspace.tsx`
themselves.

**Phase 3B — Not started.** `agent-prompt-studio.tsx` (+ its route prop gap — see
§11), `agent-detail-workspace.tsx`'s `ToolsPanel`/`KnowledgePanel`/`VersionsPanel`,
`structured-editor.tsx`'s remaining Knowledge/Tools sections, `agent-testing-panel.tsx`
resolving+pinning the published version at `beginSession()` (today it still just
displays the agent's name — the session it drives is already provenance-pinned
transparently via Phase 2, but the panel itself doesn't do that resolution or expose
it), and publishing/version-history UI. Tests: all these screens read/write the *same*
draft (assert two "screens" driven off the same `agentId` see each other's
uncommitted edits) — Phase 3A's tests already establish this pattern works via the
repository directly; Phase 3B extends it to the newly-wired screens.

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
   **Decided (supersedes this section's original recommendation of (c)):** the route
   must not choose an implicit default agent. It becomes a lightweight Agent-selection
   launcher — the actual Prompt Studio editor always operates with an explicit
   `agentId` and the canonical Agent draft, never an implicit first-agent guess or a
   degraded empty state. This is decision #3 of the versioning/knowledge-id/
   prompt-studio decision set, approved alongside #1 and #2 above. **Not built in
   Phase 1** — this is Phase 3 (screen wiring) work, since it requires
   `agent-prompt-studio.tsx`'s `agentId` prop and `useAgentDraft`/`usePublishAgent`
   from Phase 3's hook layer, neither of which exists yet.
2. **`AgentPromptStudio`'s 8 sections don't map 1:1 onto the canonical 14. Still
   unresolved — `agent-prompt-studio.tsx` wasn't touched in Phase 3A.** Proposed
   mapping unchanged from before: `Identity`→`Identity`, `Greeting`→`Identity` (folded
   in, greeting is part of identity/opening behavior), `Conversation Rules`→
   `Conversation Rules`, `Knowledge Instructions`→`Knowledge`, `Emergency Rules`→
   `Guardrails`, `Transfer Rules`→`Transfers`, `Data Collection`→`Output Format`,
   `Output Schema`→`Output Schema`. Still a judgment call for whenever Phase 3B
   migrates this component. A related, narrower split *did* land in Phase 3A, inside
   `structured-editor.tsx` itself (a different component from `AgentPromptStudio`):
   its own 9 Configuration sub-tabs split cleanly into 7 migrated (identity,
   personality, conversation rules, transfers, memory, guardrails, output schema) and
   2 deliberately not (Knowledge, Tools — overlapping the separately-scoped
   `knowledgeSourceIds`/`toolIds` capability work). No technical dependency forced
   scope expansion; the split is documented in `structured-editor.tsx` itself.
3. **Knowledge source ids don't exist yet.** Minting them (`lib/mock-data.ts`'s
   `sources`) is a small, additive, low-risk change, but it's technically outside
   "the Agent model" narrowly read — flagging so it isn't a surprise scope addition.
4. **Multi-agent workflow runs' provenance is ambiguous. Resolved in Phase 2, corrected
   one day later by a dedicated provenance audit.** The first pass populated
   `EventIdentity.agentId`/`agentVersionId` per-event (on `agent.started`/
   `agent.responded`'s own payload fields) and additionally at the run level
   (`ExecutionRecorder.setProvenance`) only when `collectAgentIds` found exactly one
   distinct agent — otherwise left undefined at that level, exactly as originally
   recommended. **What that pass missed**: for a genuinely multi-agent workflow, the
   *complete* agentId → agentVersionId binding (every agent the definition references,
   not just the ones a given run's node walk happens to invoke) was never durably
   recorded anywhere on the canonical event stream — only held in the
   `pinnedAgentVersions` closure inside `runConversationSession`, invisible to any
   projection reading events after the fact. An agent referenced only by an untaken
   decision branch would leave no trace. Closed by adding `run.started.agentVersions`
   (see `lib/workflow-events.ts`'s note above) — the complete binding, captured once at
   session start, present on the stream regardless of which branch executes. 5 new
   tests in `lib/conversation-runtime.test.ts`'s "Multi-agent runtime provenance"
   describe block now cover exactly this: a two-agent sequential workflow, a branching
   workflow where one agent's node is never visited, per-node correctness, mid-session
   republish-of-both-agents pinning, and a direct assertion that `MockAgentRuntime`
   resolves only the exact id it's given, never a fresh "latest published" lookup.
5. **`AgentRequest` is a "stable" contract. Done, in Phase 2** — `agentVersionId:
   string` added to both `AgentRequest` and `AgentResult`. Confirmed additive: no
   interface's shape or async nature changed, only a new required field on the request/
   result data objects. `'unknown'` is the sentinel for "not resolved," matching the
   existing `promptVersion`/`model`/`voice` fallback pattern rather than inventing a
   new one.
6. **Orphaned localStorage keys. Partially superseded — the store wasn't removed in
   Phase 3A, only narrowed.** `agent-builder-store.ts` still exists, still persists to
   `relay-agent-builder-${agentId}`, but is now authoritative for only 2 of its 14
   sections (Knowledge, Tools) — the other 12 keys inside each stored blob (Identity,
   Personality, Purpose, etc.) are still physically present in localStorage but no
   longer read by anything. Harmless, same reasoning as before. This note becomes
   literally accurate again — full removal, real orphaning — once Phase 3B migrates
   Knowledge/Tools and the file is actually deleted.
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
