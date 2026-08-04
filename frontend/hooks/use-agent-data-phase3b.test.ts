// Phase 3B tests (documentation/agent-model-implementation-plan.md) — Knowledge/Tools
// capability wiring, Prompt Studio's shared draft, and version history/publish/rollback
// as observed through the real getDefaultAgentRepository() singleton, following the
// same convention hooks/use-agent-data.test.ts already established (no component-test
// harness in this repo — see agent-model-implementation-plan.md §11 risk 8). Every test
// uses a unique agent name and asserts only on the record it created, since this is the
// real shared module-level singleton.
import { describe, expect, it } from 'vitest';
import { getDefaultAgentRepository } from '@/lib/agent-repository';
import { publishAgentDraft, rollbackDraftToVersion } from '@/lib/agent-publish';
import { sources } from '@/lib/mock-data';
import { tools } from '@/lib/mock-tools';

describe('Knowledge/Tools capability selection — stable ids, not names', () => {
  it('KnowledgePanel/ToolsPanel-style writes store stable ids on the canonical draft', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Phase3B Capability Agent' });

    await repository.updateDraft(created.agentId, {
      knowledgeSourceIds: [sources[0].id, sources[1].id],
      toolIds: [tools[0].id],
    });

    const draft = await repository.getDraft(created.agentId);
    expect(draft.knowledgeSourceIds).toEqual([sources[0].id, sources[1].id]);
    expect(draft.toolIds).toEqual([tools[0].id]);
  });

  it('renaming a knowledge source in the catalog does not break an agent reference to it', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Phase3B Rename Agent' });
    const source = sources[0];
    await repository.updateDraft(created.agentId, { knowledgeSourceIds: [source.id] });

    // Simulate a catalog rename — the reference the draft holds is an id, never the
    // name, so it's immune to this.
    const renamedCatalog = sources.map((item) =>
      item.id === source.id ? { ...item, name: 'A Completely Renamed Source' } : item,
    );

    const draft = await repository.getDraft(created.agentId);
    expect(draft.knowledgeSourceIds).toEqual([source.id]);
    const resolved = renamedCatalog.find((item) => item.id === draft.knowledgeSourceIds[0]);
    expect(resolved?.id).toBe(source.id);
    expect(resolved?.name).not.toBe(source.name); // sanity: the rename actually changed the name
  });
});

describe('Prompt Studio / Configuration / Knowledge / Tools share one canonical draft', () => {
  it('an edit made via one path (e.g. structured-editor.tsx) is immediately visible via another (e.g. agent-prompt-studio.tsx)', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Phase3B Shared Draft Agent' });

    // "Configuration" writes a free-text section.
    await repository.updateDraft(created.agentId, {
      instructions: { Identity: 'Written from Configuration' },
    });
    // "Knowledge"/"Tools" tabs write capability ids.
    await repository.updateDraft(created.agentId, {
      knowledgeSourceIds: [sources[0].id],
      toolIds: [tools[0].id],
    });

    // "Prompt Studio" reads the same draft and sees every prior write.
    const draft = await repository.getDraft(created.agentId);
    expect(draft.instructions.Identity).toBe('Written from Configuration');
    expect(draft.knowledgeSourceIds).toEqual([sources[0].id]);
    expect(draft.toolIds).toEqual([tools[0].id]);
  });
});

describe('Version history contains real AgentVersions', () => {
  it('a freshly created agent has no versions until published, then a real one after', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Phase3B Version History Agent' });
    expect(await repository.listVersions(created.agentId)).toEqual([]);

    await repository.updateDraft(created.agentId, {
      instructions: {
        Identity: 'A'.repeat(30),
        Purpose: 'B'.repeat(30),
        'Behavior Rules': 'C'.repeat(30),
        Transfers: 'D'.repeat(30),
      },
    });
    const published = await publishAgentDraft(repository, created.agentId);

    const versions = await repository.listVersions(created.agentId);
    expect(versions).toHaveLength(1);
    expect(versions[0].versionId).toBe(published.versionId);
    expect(versions[0].status).toBe('published');
  });
});

describe('Agent Testing resolves a real published version explicitly', () => {
  it('getPublishedVersion is null before publish and a real version after — no silent "latest" fallback', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Phase3B Testing Gate Agent' });
    expect(await repository.getPublishedVersion(created.agentId)).toBeNull();

    await repository.updateDraft(created.agentId, {
      instructions: {
        Identity: 'A'.repeat(30),
        Purpose: 'B'.repeat(30),
        'Behavior Rules': 'C'.repeat(30),
        Transfers: 'D'.repeat(30),
      },
    });
    const published = await publishAgentDraft(repository, created.agentId);

    const resolved = await repository.getPublishedVersion(created.agentId);
    expect(resolved?.versionId).toBe(published.versionId);
  });
});

describe('Rollback (Prompt Studio) copies into the draft without mutating history', () => {
  it('rollback via lib/agent-publish.ts leaves listVersions unchanged and the draft updated', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Phase3B Rollback Agent' });
    const requiredInstructions = {
      Identity: 'A'.repeat(30),
      Purpose: 'B'.repeat(30),
      'Behavior Rules': 'C'.repeat(30),
      Transfers: 'D'.repeat(30),
    };
    await repository.updateDraft(created.agentId, {
      instructions: requiredInstructions,
      voice: 'v1',
    });
    const v1 = await publishAgentDraft(repository, created.agentId);

    await repository.updateDraft(created.agentId, { voice: 'v2-draft-only' });
    const rolledBack = await rollbackDraftToVersion(repository, created.agentId, v1.versionId);

    expect(rolledBack.voice).toBe('v1');
    expect(await repository.listVersions(created.agentId)).toHaveLength(1);
    expect((await repository.getVersion(v1.versionId))?.voice).toBe('v1');
  });
});
