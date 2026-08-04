import { beforeEach, describe, expect, it } from 'vitest';
import { LocalAgentRepository, type KeyValueStorage } from '@/lib/agent-repository';
import {
  AgentPublishValidationError,
  publishAgentDraft,
  rollbackDraftToVersion,
} from '@/lib/agent-publish';

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

const validRequiredSections = {
  Identity: 'A'.repeat(30),
  Purpose: 'B'.repeat(30),
  'Behavior Rules': 'C'.repeat(30),
  Transfers: 'D'.repeat(30),
};

let repo: LocalAgentRepository;
beforeEach(() => {
  repo = freshRepository();
});

describe('publishAgentDraft', () => {
  it('publishes successfully once required sections are filled in, creating a complete immutable snapshot', async () => {
    const agent = await repo.createAgent({ name: 'Complete Agent' });
    await repo.updateDraft(agent.agentId, { instructions: validRequiredSections, voice: 'Nova' });

    const published = await publishAgentDraft(repo, agent.agentId);

    expect(published.status).toBe('published');
    expect(published.versionNumber).toBe(1);
    expect(published.voice).toBe('Nova');
    expect(published.instructions.Identity).toBe(validRequiredSections.Identity);
  });

  it('throws AgentPublishValidationError and creates no version when required instructions are missing', async () => {
    const agent = await repo.createAgent({ name: 'Incomplete Agent' });
    const before = await repo.listVersions(agent.agentId);
    expect(before).toHaveLength(0);

    await expect(publishAgentDraft(repo, agent.agentId)).rejects.toThrow(
      AgentPublishValidationError,
    );

    const after = await repo.listVersions(agent.agentId);
    expect(after).toHaveLength(0); // no partial version was created
    expect(await repo.getPublishedVersion(agent.agentId)).toBeNull();
  });

  it('a second publish after fixing validation creates a new version without touching the failed attempt (there was none)', async () => {
    const agent = await repo.createAgent({ name: 'Fix Then Publish' });
    await expect(publishAgentDraft(repo, agent.agentId)).rejects.toThrow();

    await repo.updateDraft(agent.agentId, { instructions: validRequiredSections });
    const published = await publishAgentDraft(repo, agent.agentId);
    expect(published.versionNumber).toBe(1);
    expect(await repo.listVersions(agent.agentId)).toHaveLength(1);
  });
});

describe('rollbackDraftToVersion', () => {
  it('copies an immutable published version into the draft without mutating the version or creating a new one', async () => {
    const agent = await repo.createAgent({ name: 'Rollback Agent' });
    await repo.updateDraft(agent.agentId, {
      voice: 'Voice A',
      instructions: { ...validRequiredSections, Identity: 'Identity A padded to length'.repeat(2) },
    });
    const v1 = await publishAgentDraft(repo, agent.agentId);

    await repo.updateDraft(agent.agentId, { voice: 'Voice B' });
    expect((await repo.getDraft(agent.agentId)).voice).toBe('Voice B');

    const rolledBackDraft = await rollbackDraftToVersion(repo, agent.agentId, v1.versionId);

    expect(rolledBackDraft.voice).toBe('Voice A');
    expect(rolledBackDraft.status).toBe('draft'); // still the draft record, not a new version
    expect(rolledBackDraft.versionId).toBe(`${agent.agentId}-draft`);

    const stillV1 = await repo.getVersion(v1.versionId);
    expect(stillV1?.voice).toBe('Voice A'); // the source version is untouched
    expect(await repo.listVersions(agent.agentId)).toHaveLength(1); // rollback created no version
  });

  it('rolling back and then publishing again produces a new, distinct version — history is never mutated in place', async () => {
    const agent = await repo.createAgent({ name: 'Rollback Then Publish' });
    await repo.updateDraft(agent.agentId, {
      instructions: validRequiredSections,
      voice: 'v1 voice',
    });
    const v1 = await publishAgentDraft(repo, agent.agentId);

    await repo.updateDraft(agent.agentId, { voice: 'v2 draft voice' });
    await rollbackDraftToVersion(repo, agent.agentId, v1.versionId);
    const v2 = await publishAgentDraft(repo, agent.agentId);

    expect(v2.versionId).not.toBe(v1.versionId);
    expect(v2.versionNumber).toBe(2);
    expect(v2.voice).toBe('v1 voice');
    const versions = await repo.listVersions(agent.agentId);
    expect(versions.map((v) => v.versionId)).toEqual([v2.versionId, v1.versionId]);
  });

  it('throws for an unknown version id rather than silently copying nothing', async () => {
    const agent = await repo.createAgent({ name: 'Unknown Version' });
    await expect(
      rollbackDraftToVersion(repo, agent.agentId, 'not-a-real-version'),
    ).rejects.toThrow();
  });
});
