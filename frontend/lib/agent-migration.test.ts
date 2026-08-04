import { describe, expect, it } from 'vitest';
import { migrateAgents } from '@/lib/agent-migration';
import { agents as legacyAgents } from '@/lib/mock-data';

describe('migrateAgents', () => {
  it('produces one canonical Agent per legacy fixture agent, with stable ids', () => {
    const { agents } = migrateAgents();
    expect(agents).toHaveLength(legacyAgents.length);
    expect(agents.map((a) => a.agentId)).toEqual(legacyAgents.map((a) => a.id));
  });

  it('is deterministic across calls', () => {
    const first = migrateAgents();
    const second = migrateAgents();
    expect(second).toEqual(first);
  });

  it('gives every agent a draft and exactly one seeded published version', () => {
    const { agents, versions } = migrateAgents();
    for (const agent of agents) {
      expect(agent.draftVersionId).toBe(`${agent.agentId}-draft`);
      expect(agent.publishedVersionId).toBe(`${agent.agentId}-v1`);

      const draft = versions.find((v) => v.versionId === agent.draftVersionId);
      const published = versions.find((v) => v.versionId === agent.publishedVersionId);
      expect(draft?.status).toBe('draft');
      expect(draft?.versionNumber).toBe(0);
      expect(published?.status).toBe('published');
      expect(published?.versionNumber).toBe(1);
    }
  });

  it('preserves the legacy promptVersion as legacyLabel, not as versionNumber', () => {
    const { versions } = migrateAgents();
    const a1Published = versions.find((v) => v.versionId === 'a1-v1');
    const legacyA1 = legacyAgents.find((a) => a.id === 'a1')!;
    expect(a1Published?.legacyLabel).toBe(legacyA1.promptVersion);
    expect(a1Published?.versionNumber).toBe(1);
  });

  it('derives workflowIds by reverse-scanning Workflow.agentIds, not by fabricating bindings', () => {
    const { versions } = migrateAgents();
    const a1Draft = versions.find((v) => v.versionId === 'a1-draft');
    const a3Draft = versions.find((v) => v.versionId === 'a3-draft');
    expect(a1Draft?.workflowIds).toEqual(['wf_sales_qualification']);
    expect(a3Draft?.workflowIds).toEqual([]);
  });

  it('seeds toolIds/knowledgeSourceIds empty — no fixture binds a legacy agent to either', () => {
    const { versions } = migrateAgents();
    for (const version of versions) {
      expect(version.toolIds).toEqual([]);
      expect(version.knowledgeSourceIds).toEqual([]);
    }
  });
});
