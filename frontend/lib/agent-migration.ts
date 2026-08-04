// One-time seed: translates the legacy fixture Agent representations into the
// canonical Agent/AgentVersion shape (lib/agent-model.ts). Pure function — no I/O, no
// randomness, no wall clock — so it's deterministic and directly testable.
//
// This is the only compatibility adapter this migration needs, and it's a one-time
// seed, not a long-lived shim: LocalAgentRepository calls it once, only when its
// backing store is empty. See documentation/agent-model-implementation-plan.md §9 for
// the removal condition.

import { agents as legacyAgents } from '@/lib/mock-data';
import { workflows } from '@/lib/mock-workflows';
import type {
  Agent,
  AgentVersion,
  AgentVersionConfig,
  InstructionSection,
} from '@/lib/agent-model';

// The one shared default section text — every fixture agent seeds from the same text
// today, so migrating "each agent's saved text" and "the shared default" are the same
// operation. Previously sourced from the now-removed stores/agent-builder-store.ts
// (Phase 3B deleted it once Knowledge/Tools migrated onto the canonical draft); this is
// the same literal content, now owned directly by the migration that actually uses it.
const defaultSections: Record<InstructionSection, string> = {
  Identity: 'You are Avery, a helpful sales development agent for Acme Healthcare.',
  Description: 'A concise overview of what this agent is responsible for.',
  Purpose: 'Qualify inbound leads and schedule a discovery call when there is a fit.',
  Personality: 'Warm, precise, and professionally curious.',
  Language: 'Speak English (US) by default. Match the caller when supported.',
  'Behavior Rules': 'Be concise, confirm important details, and never make unsupported claims.',
  'Conversation Rules': 'Ask one question at a time. Summarize needs before offering a next step.',
  Knowledge: 'Use the selected workspace sources. Never invent product details.',
  Tools: 'Use calendar availability only after a qualified caller asks to book.',
  Transfers: 'Transfer billing questions to the Billing queue with a short summary.',
  Memory: 'Remember the caller name, company, role, and stated priorities during the conversation.',
  Guardrails:
    'Do not provide medical advice, make guarantees, or collect sensitive patient information.',
  'Output Format': 'Capture qualified lead details in the specified structured fields.',
  'Output Schema': 'Return qualified_lead, contact_name, company, priority, and next_step.',
};

// Read-only derivation of the ownership-inverted `Workflow.agentIds` into the
// canonical `Agent.workflowIds` — the migration named in agent-model-design.md §3, not
// yet inverted at the source (`Workflow.agentIds` itself is untouched).
function workflowIdsFor(agentId: string): string[] {
  return workflows.filter((wf) => wf.agentIds.includes(agentId)).map((wf) => wf.id);
}

export type MigratedAgents = {
  agents: Agent[];
  versions: AgentVersion[];
};

export function migrateAgents(): MigratedAgents {
  const agents: Agent[] = [];
  const versions: AgentVersion[] = [];
  let clock = 0;

  for (const legacy of legacyAgents) {
    const agentId = legacy.id;
    const publishedVersionId = `${agentId}-v1`;
    const draftVersionId = `${agentId}-draft`;

    const config: AgentVersionConfig = {
      instructions: { ...defaultSections },
      voice: legacy.voice,
      model: legacy.model,
      workflowIds: workflowIdsFor(agentId),
      // No fixture today binds a legacy agent to specific tools/knowledge sources —
      // there is nothing real to migrate into these, so they seed empty rather than
      // fabricating a binding. See agent-model-implementation-plan.md §11 risk 3.
      knowledgeSourceIds: [],
      toolIds: [],
      transferPolicy: defaultSections.Transfers,
      memory: defaultSections.Memory,
      guardrails: defaultSections.Guardrails,
      outputSchema: defaultSections['Output Schema'],
    };

    const published: AgentVersion = {
      ...config,
      versionId: publishedVersionId,
      agentId,
      versionNumber: 1,
      status: 'published',
      createdAt: clock++,
      publishedAt: clock++,
      legacyLabel: legacy.promptVersion,
    };

    // The draft starts as a byte-for-byte copy of the published version, per
    // agent-model-implementation-plan.md §6 ("a draft has none [of a version number]").
    const draft: AgentVersion = {
      ...config,
      versionId: draftVersionId,
      agentId,
      versionNumber: 0,
      status: 'draft',
      createdAt: clock++,
    };

    versions.push(published, draft);
    agents.push({
      agentId,
      name: legacy.name,
      status: legacy.status,
      draftVersionId,
      publishedVersionId,
      createdAt: clock++,
    });
  }

  return { agents, versions };
}
