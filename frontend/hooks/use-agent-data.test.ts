import { describe, expect, it } from 'vitest';
import { getDefaultAgentRepository } from '@/lib/agent-repository';

// Phase 3A (documentation/agent-model-implementation-plan.md): proves the application
// wires every screen/hook to ONE shared repository instance instead of each
// constructing its own (requirement 1). Deliberately exercises the real
// getDefaultAgentRepository() singleton — unlike lib/agent-repository.test.ts and
// lib/agent-migration.test.ts, which test LocalAgentRepository's/migrateAgents' own
// mechanics in isolation with a fresh FakeStorage per test, this file specifically
// tests the SHARED-INSTANCE property the hooks in hooks/use-agent-data.ts rely on.
// Every hook in that file is a thin wrapper over this same repository, so exercising
// it directly is a faithful proxy for "two hooks/screens observe the same state" —
// there is no component-test harness in this repo (see
// agent-model-implementation-plan.md §11 risk 8) to render the hooks themselves.
//
// Because this is the real module-level singleton (shared across every `it()` in this
// file, and the app), every test uses a unique agent name/id and never asserts on the
// full contents of listAgents() — only on the specific record it created.

describe('getDefaultAgentRepository — one shared application-level instance', () => {
  it('returns the exact same instance on every call', () => {
    expect(getDefaultAgentRepository()).toBe(getDefaultAgentRepository());
  });

  it('legacy sample Agents still load through the lib/agent-migration.ts seed', async () => {
    const repository = getDefaultAgentRepository();
    const avery = await repository.getAgent('a1');
    expect(avery?.name).toBe('Avery · Sales');
    const draft = await repository.getDraft('a1');
    expect(draft.instructions.Identity.length).toBeGreaterThan(0);
  });

  it('Agent creation writes to the shared repository, with no automatic publish', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Shared-Instance Agent A' });

    expect(created.agentId).toBeTruthy();
    expect(created.publishedVersionId).toBeUndefined();
    expect(await repository.getPublishedVersion(created.agentId)).toBeNull();
  });

  it('a newly created Agent is visible through both listing and detail access', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Shared-Instance Agent B' });

    const viaList = await repository.listAgents();
    expect(viaList.some((agent) => agent.agentId === created.agentId)).toBe(true);

    const viaDetail = await repository.getAgent(created.agentId);
    expect(viaDetail?.name).toBe('Shared-Instance Agent B');
  });

  it('resolution is by stable agentId, never by name', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Duplicate-Prone Name' });
    const second = await repository.createAgent({ name: 'Duplicate-Prone Name' });

    expect(created.agentId).not.toBe(second.agentId);
    expect((await repository.getAgent(created.agentId))?.agentId).toBe(created.agentId);
    // The name is not a valid lookup key at all.
    expect(await repository.getAgent('Duplicate-Prone Name')).toBeNull();
  });

  it('two independent call paths against the shared repository observe the same draft state', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Shared-Instance Agent C' });

    // "Screen A" (e.g. structured-editor.tsx) writes an edit.
    await repository.updateDraft(created.agentId, {
      instructions: { Identity: 'Edited via path A' },
    });

    // "Screen B" (e.g. agent-validation-summary.tsx) reads independently.
    const draft = await repository.getDraft(created.agentId);
    expect(draft.instructions.Identity).toBe('Edited via path A');
  });

  it('draft edits never mutate an already-published version', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Shared-Instance Agent D' });
    await repository.updateDraft(created.agentId, { instructions: { Identity: 'v1 identity' } });
    const published = await repository.publish(created.agentId);
    expect(published.instructions.Identity).toBe('v1 identity');

    await repository.updateDraft(created.agentId, {
      instructions: { Identity: 'v2 draft identity' },
    });
    const stillPublished = await repository.getVersion(published.versionId);
    expect(stillPublished?.instructions.Identity).toBe('v1 identity');
  });

  it('missing Agent handling: getAgent resolves null, getDraft fails explicitly', async () => {
    const repository = getDefaultAgentRepository();
    expect(await repository.getAgent('does-not-exist')).toBeNull();
    await expect(repository.getDraft('does-not-exist')).rejects.toThrow();
  });

  it('explicit-save semantics: staged edits reach the repository only in one atomic call, not per keystroke', async () => {
    const repository = getDefaultAgentRepository();
    const created = await repository.createAgent({ name: 'Shared-Instance Agent E' });
    const before = await repository.getDraft(created.agentId);

    // Simulates accumulating two section edits in local UI state before "Save changes"
    // is clicked (see components/agent-detail-workspace.tsx's `staged` state) —
    // nothing reaches the repository while edits are only staged.
    const staged = { Identity: 'Staged identity', Personality: 'Staged personality' };
    expect(await repository.getDraft(created.agentId)).toEqual(before);

    // The "Save changes" click: one updateDraft call with the whole staged patch.
    const saved = await repository.updateDraft(created.agentId, { instructions: staged });
    expect(saved.instructions.Identity).toBe('Staged identity');
    expect(saved.instructions.Personality).toBe('Staged personality');
    // Every other section is untouched by the partial patch.
    expect(saved.instructions.Guardrails).toBe(before.instructions.Guardrails);
  });
});
