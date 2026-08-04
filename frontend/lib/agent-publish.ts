// Publish and rollback orchestration for the canonical Agent draft/version model — see
// documentation/agent-model-implementation-plan.md Phase 3B (publishing, requirement 5;
// version-history rollback, requirement 6). Kept as plain, repository-injected functions
// (not inline inside hooks/use-agent-data.ts's mutationFns) so they're directly
// unit-testable without a component-test harness — this repo's established convention
// (see agent-model-implementation-plan.md §11 risk 8).

import type { AgentRepository } from '@/lib/agent-repository';
import type { AgentVersion } from '@/lib/agent-model';
import { validateAgentConfig } from '@/lib/agent-validation';

export class AgentPublishValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentPublishValidationError';
  }
}

/**
 * Publishes an agent's current draft as a new immutable AgentVersion. Fails explicitly
 * — before `repository.publish` is ever called — when a required instruction section
 * is missing, so a failed publish never creates a partial/invalid version. See Phase 3B
 * requirement 5.
 */
export async function publishAgentDraft(
  repository: AgentRepository,
  agentId: string,
): Promise<AgentVersion> {
  const draft = await repository.getDraft(agentId);
  const issues = validateAgentConfig(draft.instructions).filter(
    (result) => result.severity === 'error',
  );
  if (issues.length > 0) {
    throw new AgentPublishValidationError(
      `Cannot publish — required section${issues.length === 1 ? '' : 's'} still missing: ` +
        `${issues.map((issue) => issue.section).join(', ')}.`,
    );
  }
  return repository.publish(agentId);
}

/**
 * Copies an immutable published version's complete configuration into the agent's
 * editable draft. The source version is only read, never mutated — the draft record is
 * what's overwritten, and it takes a later, separate `publish()` call to turn this into
 * a new version of its own. See Phase 3B requirement 6 ("rollback must not mutate an old
 * version... copy the selected version into the editable draft").
 */
export async function rollbackDraftToVersion(
  repository: AgentRepository,
  agentId: string,
  versionId: string,
): Promise<AgentVersion> {
  const version = await repository.getVersion(versionId);
  if (!version) throw new Error(`Unknown agent version: ${versionId}`);
  // Explicit field list (rather than destructure-and-omit) so it's clear at a glance
  // that only AgentVersionConfig's content copies over — none of the version's own
  // identity/lifecycle fields (versionId, versionNumber, status, timestamps).
  return repository.updateDraft(agentId, {
    instructions: version.instructions,
    voice: version.voice,
    model: version.model,
    workflowIds: version.workflowIds,
    knowledgeSourceIds: version.knowledgeSourceIds,
    toolIds: version.toolIds,
    transferPolicy: version.transferPolicy,
    memory: version.memory,
    guardrails: version.guardrails,
    outputSchema: version.outputSchema,
  });
}
