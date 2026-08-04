// Canonical Agent data model — see documentation/agent-model-design.md (the approved
// target shape) and documentation/agent-model-implementation-plan.md §5 (this file).
//
// A stable Agent owns exactly one editable draft AgentVersion and zero or more
// immutable published AgentVersions. Publishing snapshots the draft into a new,
// never-mutated version; it never rewrites a prior one. See lib/agent-repository.ts
// for the mechanics that maintain that invariant.

export type InstructionSection =
  | 'Identity'
  | 'Description'
  | 'Purpose'
  | 'Personality'
  | 'Language'
  | 'Behavior Rules'
  | 'Conversation Rules'
  | 'Knowledge'
  | 'Tools'
  | 'Transfers'
  | 'Memory'
  | 'Guardrails'
  | 'Output Format'
  | 'Output Schema';

export type AgentVersionConfig = {
  instructions: Record<InstructionSection, string>;
  voice: string;
  model: string;
  workflowIds: string[]; // design doc §3 — ownership direction correction
  knowledgeSourceIds: string[]; // design doc §4 — capability, not invocation
  toolIds: string[]; // design doc §4 — capability, not invocation
  transferPolicy: string; // design doc §2
  memory: string; // design doc §2 — inert string, no engine semantics
  guardrails: string; // design doc §2 — inert string, no enforcement point
  outputSchema: string; // design doc §2 — inert string, no validation
};

export type AgentVersion = AgentVersionConfig & {
  versionId: string;
  agentId: string;
  // 1, 2, 3... for published versions. A draft is never published, so it carries 0 —
  // there is no "version zero" concept elsewhere; this is purely the repository's
  // sentinel for "not yet a numbered version."
  versionNumber: number;
  status: 'draft' | 'published';
  createdAt: number; // deterministic logical clock (see lib/agent-repository.ts), not Date.now()
  publishedAt?: number;
  // Migrated promptVersion strings ('v14', 'v12', ...) preserved for display/debugging
  // continuity only — never read by logic. Removal condition: once no UI shows it.
  // See documentation/agent-model-implementation-plan.md §9.
  legacyLabel?: string;
};

export type Agent = {
  agentId: string;
  name: string;
  // Operational status — distinct from AgentVersion['status'], which is a
  // version-lifecycle concept. See agent-model-implementation-plan.md §4.B.
  status: 'Active' | 'Draft' | 'Paused';
  draftVersionId: string; // always present — every agent always has exactly one open draft
  publishedVersionId?: string; // absent until the first publish
  createdAt: number;
};
