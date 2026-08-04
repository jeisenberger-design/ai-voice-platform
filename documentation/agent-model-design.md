# Agent Model — Design

Status: **Approved** (design committed before implementation)
Scope: frontend/mock only, data model + ownership relationships. No execution-engine or
event-schema changes in this pass; where this design touches `consultWorkflow` or the
event stream, it says so explicitly and defers the change to a follow-up.

## Purpose

`documentation/project-constitution.md` states the platform's thesis plainly: *"The
Agent is the center of the platform... An Agent should never simply be a prompt."* No
document has ever defined what an Agent actually **is** with the rigor
`conversation-runtime-design.md` gave the Conversation Runtime. This gap is not
theoretical — auditing the current Agent-related code turned up four different,
disconnected partial answers to "what is an agent's configuration," none of which the
execution engine reads. This document proposes one target model and an explicit
ownership relationship to Workflow, Conversation, and Call, so that future Agent-domain
work (memory, guardrails, output schema, agent-initiated tools) has one shape to build
against instead of a fifth one.

## 1. The problem: four disconnected models of "what an agent is"

| # | Where | What it holds | Who reads it |
|---|---|---|---|
| 1 | `Agent` (`lib/mock-data.ts`) | `id, name, purpose, voice, promptVersion, model, calls, successRate, status, updated` | The only one the execution engine actually sees — `AgentRuntime.respond()` is called with `agentId`, and node executors reference `Agent` fixtures for list/detail UI. |
| 2 | `AgentBuilderConfig` (`stores/agent-builder-store.ts`) | 14 free-text sections (Identity, Description, Purpose, Personality, Language, Behavior Rules, Conversation Rules, Knowledge, Tools, Transfers, Memory, Guardrails, Output Format, Output Schema) + voice/pace/interruption settings. Zustand `persist` → **localStorage**, keyed per agent. | `StructuredEditor` (edits it), `agent-validation.ts` (validates 4 of the 14 sections), and `AgentTestingPanel` — which reads exactly **one** field, `sections.Purpose`, to interpolate into an otherwise-hardcoded canned response. |
| 3 | `AgentPromptStudio` (`components/agent-prompt-studio.tsx`) | A **different** 8-section list (Identity, Greeting, Conversation Rules, Knowledge Instructions, Emergency Rules, Transfer Rules, Data Collection, Output Schema) plus a fully hardcoded `versions` array. All local `useState`. | Nothing — not persisted, not connected to (2), "Publish"/"Rollback"/"Compare" only flip local booleans. |
| 4 | `ToolsPanel` (inside `agent-detail-workspace.tsx`) | A hardcoded local toggle list: `['Calendar availability', 'CRM lookup', 'Create lead', 'Send follow-up']` | Nothing — unrelated to `mock-tools.ts`'s real `Tool` registry or `Workflow.toolIds`. |

None of (2), (3), (4) are read by `consultWorkflow`, any `NodeExecutor`, or
`AgentRuntime`. This is a more serious finding than "Agent is thin" (the original
framing in the engineering review that preceded this doc) — it's actively **fragmented**
across three additional surfaces that look authoritative to a user (there's a save
button, a publish button, a version history) but do nothing.

There is also a confirmed **ownership inversion**: `Workflow` carries `agentIds:
string[]` (`lib/mock-workflows.ts:60`) — the workflow owns its list of participating
agents. No `Agent.workflowId` exists anywhere. This is backwards relative to the
constitution's own framing ("Workflows... define what an Agent does") and to how every
named competitor (Vapi, Retell, Bland) actually models the relationship: you configure
an Assistant/Agent, and a flow is one property of it, not a container it's filed under.

## 2. Target model

Mapping the constitution's own list (Identity, Personality, Conversation Rules,
Knowledge, Memory, Tools, Workflows, Transfers, Guardrails, Output Schema, Runtime,
Evaluation) against what already exists vs. what's new:

| Constitution concept | Status | Resolution |
|---|---|---|
| Runtime | Exists | `AgentRuntime` (`lib/runtime/contracts.ts`) — unchanged by this doc. |
| Identity / Personality / Conversation Rules | Exists as free text (surface 2) | Becomes `Agent.instructions: Record<InstructionSection, string>` — keep the sectioned-text approach (see §5), but on the canonical `Agent` type, not a Zustand-only store. |
| promptVersion / model / voice | Exists on `Agent` | Unchanged. |
| Workflows | Exists, inverted (§1) | `Agent.workflowIds: string[]` replaces reliance on `Workflow.agentIds` as the ownership-bearing field (§3). |
| Knowledge, Tools | Exists ×2, both disconnected (surfaces 2 & 4) | `Agent.knowledgeSourceIds: string[]`, `Agent.toolIds: string[]` — declares **capability**, not invocation (§4). |
| Transfers | Exists as free text only | `Agent.transferPolicy: string` (structured target-selection is future work — the `transfer` node's `ref`/`inputBindings` are already unused dead code per the prior engineering review; fixing that is an engine change, out of scope here). |
| Guardrails | Exists as free text only | `Agent.guardrails: string` for now. Enforcement point doesn't exist in the engine yet — explicitly deferred (§7), matching `ARCHITECTURE.md`'s existing reasoning for why this wasn't added earlier. |
| Output Schema | Exists as free text only | `Agent.outputSchema: string` for now; typed schema + engine-side validation is future work, same reasoning as Guardrails. |
| Memory | Exists as free text only | Deferred entirely (§7) — there's no session-spanning storage concept in the event model yet to hang real memory off of. |
| Evaluation | Doesn't exist | Deferred (§7) — depends on the Calls/CallRecord migration landing first. |

This keeps the type additive and mock-appropriate: every new field is either a string
(today's authoring granularity) or an id list (referencing types that already exist).
Nothing here requires engine or event-schema changes.

## 3. Ownership: Agent → Workflow, not Workflow → Agent

Proposed correction: `Agent.workflowIds: string[]` becomes the ownership-bearing field.
`Workflow` keeps existing as a first-class, shareable object (a workflow can still be
reused across agents — that's a legitimate reason it stays standalone), but the primary
authoring and navigation direction should read **Agent → Workflow**, matching the
constitution's own description and how competitors model it.

This document does **not** propose ripping out `Workflow.agentIds` immediately — that's
a coordinated data-migration + UI-navigation change (workflow detail's "Connections"
panel, agent detail's future "Workflows" tab) better scoped as its own follow-up once
this model is agreed. What matters now is that new code stops being written against the
inverted assumption.

## 4. Tools & Knowledge: capability vs. invocation

`ARCHITECTURE.md` already reasoned about this once, for a different question: *"tool/
knowledge bindings — workflows already bind these per-node; agent-level bindings would
create a second source of truth until agent-initiated tool use exists."* That reasoning
is correct for **invocation** — a `tool` node deterministically calls one specific tool
because the graph says so, regardless of which agent is attached to that consultation.
Agent-level bindings shouldn't compete with that.

But invocation isn't the only concept here. `Agent.toolIds`/`knowledgeSourceIds` are
proposed as **capability** — which tools/sources this agent is *permitted* to use at
all, an authoring-time governance question (this is literally what the existing,
disconnected `ToolsPanel` toggle list is already trying to be). Capability and
invocation are different concerns:

- A workflow's `tool` node invokes a specific tool because the graph routes there —
  unaffected by which agent is running it.
- An agent's `toolIds` describes its toolkit — relevant the moment agent-initiated
  (function-calling) tool use exists, and useful even before that as a permissions/
  authoring concept (what's this agent even allowed to reach for).

This isn't a reversal of the existing debt note — agent-initiated invocation stays
explicitly unbuilt (§7) — it's a narrower claim that *declaring* capability doesn't
require invocation to exist yet, and gives `ToolsPanel` a real model to be backed by
instead of a local-only toggle list.

## 5. Structured configuration & versioning

**Sectioned text is fine; the current version story isn't.** The constitution's Prompt
Philosophy explicitly rejects "one giant prompt textbox" in favor of sectioned,
versioned, publishable documents. The sectioned part is already reasonably served by
`AgentBuilderConfig`'s per-section free text (surface 2) — that's a legitimate authoring
granularity for a mock/frontend-first phase, and this doc doesn't propose replacing free
text with fully structured fields yet (that's real design work — parsing/validating
prose into structured behavior is its own problem, not a data-modeling one).

What's actually missing is **real versioning**. Today, `AgentBuilderConfig` holds only
`config` (draft) and `savedConfig` (last save) — two states, not a history. Both
`VersionsPanel` and `AgentPromptStudio`'s version list are 100% hardcoded fixtures with
no backing store. Given the constitution's explicit requirement ("Support: Versioning,
Comparison, Rollback, Publishing"), this is a real gap, not a nice-to-have — but
implementing real version history needs a storage decision (still localStorage? an
array on the mock fixture?) this doc doesn't resolve. Flagging it as a named,
un-deferred gap for the next design pass rather than pretending the sectioned-textarea
UI already satisfies it.

**Consolidation, not addition.** Three UIs currently claim to edit "the agent's
configuration" (`StructuredEditor`+`AgentBuilderConfig`, `AgentPromptStudio`,
`ToolsPanel`). The target state is **one** canonical editing surface, backed by the
`Agent` type from §2. `AgentBuilderConfig`'s section list and persistence approach is
the closest existing artifact to that target and is the proposed seed; `AgentPromptStudio`
and `ToolsPanel`'s local toggle list are proposed for removal once their real
counterparts exist on `Agent` — not preserved as a second "studio" experience.

## 6. Testing & execution integration

This is the forcing function referenced in the prior engineering review:
`AgentTestingPanel` currently runs a hand-scripted `setTimeout` fake chat
(`lib/test-scenarios.ts`), never touching `WorkflowContext`, `ExecutionRecorder`,
`PlatformRuntime`, or `consultWorkflow`. At the model level (implementation is the next,
separate milestone), testing an agent should mean: resolve the agent's `instructions`/
`toolIds`/`knowledgeSourceIds` (§2) into a real consultation — either the agent's first
bound `workflowId` (§3), or, when an agent has no workflow yet, a minimal synthetic
single-node consultation that still goes through `consultWorkflow` and emits real
events. Either way, an agent test becomes a real session on the real event stream,
observable through the same projections as a workflow run — not a second code path.

The precise mechanism (synthetic workflow vs. a dedicated lightweight entry point into
`consultWorkflow`) is an implementation decision for that milestone, not this doc.

## 7. Explicitly out of scope for this doc

Matching `ARCHITECTURE.md`'s existing discipline of naming deferred work rather than
silently omitting it:

- **Memory** — needs a session-spanning storage concept the event model doesn't have
  yet (today, `WorkflowContext` is per-run). Modeling this before persistence exists
  risks guessing the wrong shape, same reasoning the engineering review applied to
  tenancy.
- **Guardrail enforcement** — needs an actual enforcement point in the engine (where in
  `consultWorkflow` or which `NodeExecutor` checks it) before the field means anything
  beyond documentation. `Agent.guardrails` stays a string until that exists.
- **Output schema validation** — same reasoning; needs the engine to do something with
  the schema, not just store it.
- **Agent-initiated (function-calling) tool use** — `Agent.toolIds` declares capability
  now (§4); the engine gaining a path for the agent's own response to trigger a tool
  call is separate, larger work.
- **Real prompt-version history storage** — named as a gap in §5, **resolved by §9
  below** (a separate, later-approved architecture decision, not part of this
  document's original approval).
- **The `Workflow.agentIds` → `Agent.workflowIds` data migration** — named as the
  correct direction in §3, not executed here.

## 8. Decisions

| Decision | Resolution | Rationale |
|---|---|---|
| Free-text sections vs. fully structured fields | **Keep free text per section** for this pass | Matches current authoring granularity; structured-field parsing is separate, larger design work not blocking consolidation |
| Capability vs. invocation for Tools/Knowledge | **Both, as separate concepts** — `Agent.toolIds` (capability) alongside unchanged workflow-node bindings (invocation) | Preserves `ARCHITECTURE.md`'s existing second-source-of-truth reasoning for invocation while giving `ToolsPanel` a real backing model |
| Agent↔Workflow ownership | **`Agent.workflowIds` is canonical going forward**; `Workflow.agentIds` migration is a follow-up, not immediate | Matches constitution and competitor product shape; avoids a disruptive rename in the same pass as the model definition |
| Which existing surface seeds the canonical model | **`AgentBuilderConfig`** (section list + persistence pattern) | Closest existing artifact to the target; `AgentPromptStudio` and `ToolsPanel`'s local state are non-functional duplicates proposed for removal |
| Real version history | **Resolved — see §9** | Superseded by the approved Agent Versioning decision below |

## 9. Addendum: Agent Versioning (approved)

**Status: Approved.** This is a new architecture decision, layered on top of this
document's original approval — not something §5–§8 above already decided. It resolves
the "real prompt-version history storage" gap named in §7/§5 and is implemented by
`documentation/agent-model-implementation-plan.md` (Phase 1: `lib/agent-model.ts`,
`lib/agent-repository.ts`, `lib/agent-migration.ts`).

**The decision:** a stable `Agent` owns exactly one editable draft `AgentVersion` and
zero or more immutable published `AgentVersion`s.

- **Editing only ever touches the draft.** `Agent.draftVersionId` always resolves —
  every agent always has exactly one open draft, never `null`.
- **Publishing creates a new snapshot and never mutates a prior version.** Each publish
  produces a new `AgentVersion` record (`versionNumber` incrementing, `versionId`
  deterministic — `${agentId}-v${versionNumber}`) and repoints
  `Agent.publishedVersionId` at it. Every previously published version remains
  unchanged and fully readable.
- **Conversation sessions pin one `AgentVersion` at session start.** A runtime
  (`AgentTestingPanel`, or any future execution path) resolves
  `getPublishedVersion(agentId)` once, at the moment a session begins, and uses that
  resolved version for the session's lifetime — a version published mid-session must
  not retroactively change an in-flight run. (Wiring this into `consultWorkflow`'s
  event stream is Phase 2 of the implementation plan, not yet done.)
- `Agent.status` (operational: `'Active' | 'Draft' | 'Paused'`) and
  `AgentVersion.status` (version-lifecycle: `'draft' | 'published'`) are deliberately
  separate fields on separate types — they name different concepts and must not
  collide.

## Explicitly preserved

Event sourcing (`ExecutionEvent`/`ExecutionRecorder`/projections), the Conversation
Runtime / Workflow Engine split, the `PlatformRuntime` provider boundary, and the
structured `Predicate` model are all unaffected by this design — this document only
defines the Agent data model and its ownership relationships, not execution mechanics.
