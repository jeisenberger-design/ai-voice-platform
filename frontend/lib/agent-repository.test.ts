import { beforeEach, describe, expect, it } from 'vitest';
import { LocalAgentRepository, type KeyValueStorage } from '@/lib/agent-repository';

class FakeStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function freshRepository(): LocalAgentRepository {
  let n = 0;
  return new LocalAgentRepository({ storage: new FakeStorage(), clock: () => n++ });
}

let repo: LocalAgentRepository;
beforeEach(() => {
  repo = freshRepository();
});

describe('LocalAgentRepository', () => {
  it('seeds from the migration on first construction (empty storage)', async () => {
    const agents = await repo.listAgents();
    expect(agents).toHaveLength(4);
    expect(agents.map((a) => a.agentId).sort()).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('reuses persisted state instead of re-seeding on a second instance sharing storage', async () => {
    const storage = new FakeStorage();
    const first = new LocalAgentRepository({ storage });
    await first.updateDraft('a1', { voice: 'Custom Voice' });

    const second = new LocalAgentRepository({ storage });
    const draft = await second.getDraft('a1');
    expect(draft.voice).toBe('Custom Voice');
  });

  it('getDraft always resolves — every agent has exactly one open draft', async () => {
    const draft = await repo.getDraft('a1');
    expect(draft.status).toBe('draft');
    expect(draft.versionId).toBe('a1-draft');
  });

  it('updateDraft mutates only the draft, never the published version', async () => {
    const beforePublished = await repo.getPublishedVersion('a1');
    await repo.updateDraft('a1', { voice: 'Nova 2' });

    const draft = await repo.getDraft('a1');
    const afterPublished = await repo.getPublishedVersion('a1');

    expect(draft.voice).toBe('Nova 2');
    expect(afterPublished?.voice).toBe(beforePublished?.voice);
    expect(afterPublished?.versionId).toBe(beforePublished?.versionId);
  });

  it('updateDraft merges partial instructions rather than requiring the full record', async () => {
    await repo.updateDraft('a1', { instructions: { Identity: 'New identity text' } });
    const draft = await repo.getDraft('a1');
    expect(draft.instructions.Identity).toBe('New identity text');
    // Other sections survive the partial update.
    expect(draft.instructions.Personality.length).toBeGreaterThan(0);
  });

  it('publish creates a new immutable version and never overwrites the prior one', async () => {
    const before = await repo.listVersions('a1');
    expect(before.map((v) => v.versionId)).toEqual(['a1-v1']);

    await repo.updateDraft('a1', { voice: 'Second voice' });
    const published = await repo.publish('a1');

    expect(published.versionId).toBe('a1-v2');
    expect(published.versionNumber).toBe(2);
    expect(published.voice).toBe('Second voice');

    const after = await repo.listVersions('a1');
    expect(after.map((v) => v.versionId)).toEqual(['a1-v2', 'a1-v1']); // newest first
    const stillThere = await repo.getVersion('a1-v1');
    expect(stillThere?.voice).not.toBe('Second voice');
  });

  it('publish snapshots a deep, independent copy — the new version never shares array/object instances with the draft it was published from', async () => {
    await repo.updateDraft('a1', {
      knowledgeSourceIds: ['ks1'],
      toolIds: ['tool_calendar_availability'],
    });
    const draftBeforePublish = await repo.getDraft('a1');
    const published = await repo.publish('a1');

    // Same content...
    expect(published.instructions).toEqual(draftBeforePublish.instructions);
    expect(published.knowledgeSourceIds).toEqual(draftBeforePublish.knowledgeSourceIds);
    expect(published.toolIds).toEqual(draftBeforePublish.toolIds);
    // ...but never the same object/array instance. If it were, any future in-place
    // mutation of the draft's nested fields (rather than always replacing them, which
    // is all this codebase's UI does today) would silently corrupt "immutable" history.
    expect(published.instructions).not.toBe(draftBeforePublish.instructions);
    expect(published.knowledgeSourceIds).not.toBe(draftBeforePublish.knowledgeSourceIds);
    expect(published.toolIds).not.toBe(draftBeforePublish.toolIds);
    expect(published.workflowIds).not.toBe(draftBeforePublish.workflowIds);
  });

  it('getPublishedVersion returns the latest published version, not the draft', async () => {
    await repo.updateDraft('a1', { voice: 'Draft-only edit' });
    const published = await repo.getPublishedVersion('a1');
    expect(published?.status).toBe('published');
    expect(published?.voice).not.toBe('Draft-only edit');

    await repo.publish('a1');
    const republished = await repo.getPublishedVersion('a1');
    expect(republished?.voice).toBe('Draft-only edit');
  });

  it('a version published mid-session does not retroactively change an already-resolved snapshot', async () => {
    const pinned = await repo.getPublishedVersion('a1');
    await repo.updateDraft('a1', { voice: 'Changed after pin' });
    await repo.publish('a1');

    // The object resolved earlier is untouched — publish() must not mutate in place.
    expect(pinned?.voice).not.toBe('Changed after pin');
  });

  it('createAgent adds a new agent with an empty draft and no published version', async () => {
    const agent = await repo.createAgent({ name: 'New Agent' });
    expect(agent.publishedVersionId).toBeUndefined();
    expect(await repo.getPublishedVersion(agent.agentId)).toBeNull();

    const draft = await repo.getDraft(agent.agentId);
    expect(draft.status).toBe('draft');
    expect(draft.versionNumber).toBe(0);
  });
});
