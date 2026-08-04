import { beforeEach, describe, expect, it } from 'vitest';
import {
  MockConversationRuntime,
  createInteractiveStimulusSource,
  runConversationSession,
  MAX_CONSULTATIONS,
  type StimulusSource,
} from '@/lib/conversation-runtime';
import {
  ExecutionRecorder,
  nextRunId,
  nextSessionId,
  type ExecutionEvent,
} from '@/lib/workflow-events';
import { createInitialContext } from '@/lib/workflow-context';
import { createMockRuntime } from '@/lib/runtime/mock-runtime';
import { projectContext } from '@/lib/workflow-projections';
import type { Workflow, WorkflowNode, WorkflowNodeKind } from '@/lib/mock-workflows';
import type { PlatformRuntime } from '@/lib/runtime/contracts';
import {
  LocalAgentRepository,
  type AgentRepository,
  type AgentVersionConfigPatch,
  type KeyValueStorage,
} from '@/lib/agent-repository';

// Covers the Conversation Runtime stabilization pass: real cancellation, truthful
// session termination, turnId/causality, and envelope parity between a scripted run
// and an interactive one. See documentation/conversation-runtime-design.md.

function workflow(overrides: Pick<Workflow, 'nodes' | 'edges'>): Workflow {
  return {
    id: 'wf_test',
    name: 'Test workflow',
    description: '',
    status: 'Draft',
    trigger: 'Test',
    version: 1,
    variables: [],
    agentIds: [],
    toolIds: [],
    knowledgeSources: [],
    runsThisMonth: 0,
    successRate: 0,
    avgDuration: '0s',
    updated: '',
    ...overrides,
  };
}

function node(
  id: string,
  kind: WorkflowNodeKind,
  label: string,
  extra: Partial<WorkflowNode> = {},
): WorkflowNode {
  return { id, kind, label, position: { x: 0, y: 0 }, ...extra };
}

// trigger -> agent (pauses once) -> end
const agentWorkflow = workflow({
  nodes: [
    node('n1', 'trigger', 'Start'),
    node('n2', 'agent', 'Agent greets caller', { ref: { type: 'agent', id: 'test-agent' } }),
    node('n3', 'end', 'Done'),
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
  ],
});

// trigger -> agent (pauses once) -> transfer -> end
const transferWorkflow = workflow({
  nodes: [
    node('n1', 'trigger', 'Start'),
    node('n2', 'agent', 'Agent greets caller', { ref: { type: 'agent', id: 'test-agent' } }),
    node('n3', 'transfer', 'Transfer to human'),
    node('n4', 'end', 'Done'),
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
  ],
});

// trigger -> agent, agent's only edge loops back to itself: never reaches an end node.
const loopingWorkflow = workflow({
  nodes: [
    node('n1', 'trigger', 'Start'),
    node('n2', 'agent', 'Agent greets caller', { ref: { type: 'agent', id: 'test-agent' } }),
  ],
  edges: [
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n2' },
  ],
});

function fixedTurnSource(text = 'Hello there'): StimulusSource {
  return {
    peekInterrupts: () => false,
    nextCallerTurn: async () => ({ kind: 'turn', turn: { text } }),
  };
}

const throwingRuntime: PlatformRuntime = {
  ...createMockRuntime(),
  agent: {
    provider: 'throwing',
    respond: async () => {
      throw new Error('provider unavailable');
    },
  },
};

function newRecorder() {
  const runId = nextRunId();
  return { runId, recorder: new ExecutionRecorder(runId, nextSessionId()) };
}

// Minimal in-memory KeyValueStorage — same pattern as agent-repository.test.ts — so
// each test gets an isolated repository instead of sharing conversation-runtime.ts's
// default singleton.
class FakeStorage implements KeyValueStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function freshAgentRepository(): AgentRepository {
  return new LocalAgentRepository({ storage: new FakeStorage() });
}

/** Creates a fresh agent, optionally edits its draft, publishes it, and returns its id. */
async function seedPublishedAgent(
  repository: AgentRepository,
  overrides: AgentVersionConfigPatch = {},
  name = 'Provenance Test Agent',
): Promise<string> {
  const agent = await repository.createAgent({ name });
  if (Object.keys(overrides).length) await repository.updateDraft(agent.agentId, overrides);
  await repository.publish(agent.agentId);
  return agent.agentId;
}

/** trigger -> agent(agentId) -> end, the minimal shape version-pinning tests need. */
function singleAgentWorkflow(agentId: string): Workflow {
  return workflow({
    nodes: [
      node('n1', 'trigger', 'Start'),
      node('n2', 'agent', 'Agent greets caller', { ref: { type: 'agent', id: agentId } }),
      node('n3', 'end', 'Done'),
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'n2' },
      { id: 'e2', source: 'n2', target: 'n3' },
    ],
  });
}

describe('MockConversationRuntime.run', () => {
  it('completes normally and reports a resolved endReason of "completed"', async () => {
    const { runId, recorder } = newRecorder();
    const runtime = new MockConversationRuntime(
      agentWorkflow,
      createMockRuntime(),
      recorder,
      runId,
      fixedTurnSource(),
    );

    const { endReason } = await runtime.run(
      createInitialContext(agentWorkflow.variables),
      undefined,
    );

    expect(endReason).toBe('completed');
    expect(recorder.list().find((event) => event.type === 'session.ended')).toMatchObject({
      reason: 'completed',
    });
  });

  it('settles with caller_hangup when cancelled while awaiting input, instead of hanging forever', async () => {
    const { runId, recorder } = newRecorder();
    const { source, cancel } = createInteractiveStimulusSource();
    const runtime = new MockConversationRuntime(
      agentWorkflow,
      createMockRuntime(),
      recorder,
      runId,
      source,
    );

    const runPromise = runtime.run(createInitialContext(agentWorkflow.variables), undefined);
    cancel();
    const { endReason } = await runPromise;

    expect(endReason).toBe('caller_hangup');
    expect(recorder.list().find((event) => event.type === 'session.ended')).toMatchObject({
      reason: 'caller_hangup',
    });
  });

  it('reports transferred, not completed, when the run includes a transfer directive', async () => {
    const { runId, recorder } = newRecorder();
    const runtime = new MockConversationRuntime(
      transferWorkflow,
      createMockRuntime(),
      recorder,
      runId,
      fixedTurnSource(),
    );

    const { endReason } = await runtime.run(
      createInitialContext(transferWorkflow.variables),
      undefined,
    );

    expect(endReason).toBe('transferred');
  });

  it('settles with reason "error" instead of rejecting when a provider throws, and never claims the call completed', async () => {
    const { runId, recorder } = newRecorder();
    const runtime = new MockConversationRuntime(
      agentWorkflow,
      throwingRuntime,
      recorder,
      runId,
      fixedTurnSource(),
    );

    const { endReason } = await runtime.run(
      createInitialContext(agentWorkflow.variables),
      undefined,
    );

    expect(endReason).toBe('error');
    const events = recorder.list();
    expect(events.some((event) => event.type === 'agent.started')).toBe(true);
    expect(events.some((event) => event.type === 'agent.responded')).toBe(false);
  });

  it('reports timeout, not completed, after exhausting MAX_CONSULTATIONS on a self-looping workflow', async () => {
    const { runId, recorder } = newRecorder();
    const runtime = new MockConversationRuntime(
      loopingWorkflow,
      createMockRuntime(),
      recorder,
      runId,
      fixedTurnSource(),
    );

    const { endReason } = await runtime.run(
      createInitialContext(loopingWorkflow.variables),
      undefined,
    );

    expect(endReason).toBe('timeout');
    const consultationIds = new Set(
      recorder
        .list()
        .filter((event) => event.type === 'consultation.started')
        .map((event) => event.consultationId),
    );
    expect(consultationIds.size).toBe(MAX_CONSULTATIONS);
  });

  it('assigns stable turnIds and makes the caller turn the causal parent of the next consultation', async () => {
    const { runId, recorder } = newRecorder();
    const runtime = new MockConversationRuntime(
      agentWorkflow,
      createMockRuntime(),
      recorder,
      runId,
      fixedTurnSource(),
    );

    await runtime.run(createInitialContext(agentWorkflow.variables), undefined);

    const events = recorder.list();
    const agentTurn = events.find(
      (event) => event.type === 'conversation.turn' && event.speaker === 'agent',
    );
    const callerTurn = events.find(
      (event) => event.type === 'conversation.turn' && event.speaker === 'caller',
    );
    expect(agentTurn?.turnId).toBeTruthy();
    expect(callerTurn?.turnId).toBeTruthy();
    expect(agentTurn?.turnId).not.toBe(callerTurn?.turnId);

    const callerTurnCompleted = events.find(
      (event) => event.type === 'turn.completed' && event.speaker === 'caller',
    );
    const consultations = events.filter((event) => event.type === 'consultation.started');
    expect(consultations).toHaveLength(2);
    // Not the prior consultation.paused event — the caller turn that actually caused it.
    expect(consultations[1].parentEventId).toBe(callerTurnCompleted?.eventId);
  });

  it('holds fold(events) === finalContext', async () => {
    const { runId, recorder } = newRecorder();
    const runtime = new MockConversationRuntime(
      agentWorkflow,
      createMockRuntime(),
      recorder,
      runId,
      fixedTurnSource(),
    );

    const { context } = await runtime.run(createInitialContext(agentWorkflow.variables), undefined);

    expect(projectContext(recorder.list())).toEqual(context);
  });
});

describe('runConversationSession', () => {
  it('produces an identical lifecycle envelope for a scripted run and an interactive run', async () => {
    // runConversationSession resolves real provenance (Phase 2), so this needs a
    // repository where the workflow's agent actually has a published version — unlike
    // the MockConversationRuntime.run tests above, which construct the runtime
    // directly and never go through resolution.
    const agentRepository = freshAgentRepository();
    const agentId = await seedPublishedAgent(agentRepository);
    const wf = singleAgentWorkflow(agentId);

    const scripted = newRecorder();
    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder: scripted.recorder,
      runId: scripted.runId,
      stimulusSource: fixedTurnSource(),
      agentRepository,
    });

    const interactive = newRecorder();
    const { source, submit } = createInteractiveStimulusSource();
    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder: interactive.recorder,
      runId: interactive.runId,
      stimulusSource: source,
      onPause: () => submit('Hello there'),
      agentRepository,
    });

    const envelopeTypes = (events: readonly ExecutionEvent[]) =>
      events
        .map((event) => event.type)
        .filter((type) =>
          (
            [
              'run.started',
              'session.opened',
              'session.ended',
              'runtime.completed',
              'run.completed',
            ] as string[]
          ).includes(type),
        );

    const scriptedEnvelope = envelopeTypes(scripted.recorder.list());
    expect(scriptedEnvelope).toEqual([
      'run.started',
      'session.opened',
      'session.ended',
      'runtime.completed',
      'run.completed',
    ]);
    expect(envelopeTypes(interactive.recorder.list())).toEqual(scriptedEnvelope);
  });
});

// Phase 2 of documentation/agent-model-implementation-plan.md: resolving a pinned
// AgentVersion once at session start, and threading that provenance through every
// event on the run. See lib/agent-repository.ts (Phase 1) for the versioning
// primitives (draft/publish/listVersions) these tests build on.
describe('Runtime provenance and version pinning (Phase 2)', () => {
  let agentRepository: AgentRepository;

  beforeEach(() => {
    agentRepository = freshAgentRepository();
  });

  it("resolves the agent's currently published version and pins its id onto every agent event", async () => {
    const agentId = await seedPublishedAgent(agentRepository, {
      instructions: { Identity: 'You are Rex, a concise test agent.' },
    });
    const wf = singleAgentWorkflow(agentId);
    const published = await agentRepository.getPublishedVersion(agentId);
    const { recorder } = newRecorder();

    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: fixedTurnSource(),
      agentRepository,
    });

    const events = recorder.list();
    const started = events.find((event) => event.type === 'agent.started');
    const responded = events.find((event) => event.type === 'agent.responded');
    expect(started?.agentVersionId).toBe(published?.versionId);
    expect(responded?.agentVersionId).toBe(published?.versionId);
  });

  it("runtime output demonstrably depends on the resolved AgentVersion, not a pure echo of the node's instruction", async () => {
    const agentId = await seedPublishedAgent(agentRepository, {
      instructions: { Identity: 'You are Rex, a concise test agent.' },
    });
    const wf = singleAgentWorkflow(agentId);
    const { recorder } = newRecorder();

    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: fixedTurnSource(),
      agentRepository,
    });

    const responded = recorder.list().find((event) => event.type === 'agent.responded') as
      Extract<ExecutionEvent, { type: 'agent.responded' }> | undefined;
    // Deterministic and specific: proves the text is derived from the resolved
    // version's own Identity field, not just an echo of the node's label.
    expect(responded?.text).toBe('You are Rex, a concise test agent. Agent greets caller');
  });

  it('a new session resolves the latest published version, not a stale earlier one', async () => {
    const agentId = await seedPublishedAgent(agentRepository, {
      instructions: { Identity: 'Version one identity.' },
    });
    await agentRepository.updateDraft(agentId, {
      instructions: { Identity: 'Version two identity.' },
    });
    const v2 = await agentRepository.publish(agentId);
    expect(v2.versionNumber).toBe(2);

    const wf = singleAgentWorkflow(agentId);
    const { recorder } = newRecorder();
    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: fixedTurnSource(),
      agentRepository,
    });

    const responded = recorder.list().find((event) => event.type === 'agent.responded');
    expect(responded?.agentVersionId).toBe(v2.versionId);
  });

  it('an in-flight session stays pinned to the version resolved at start, even after a newer version is published mid-session', async () => {
    const agentId = await seedPublishedAgent(agentRepository, {
      instructions: { Identity: 'Original identity.' },
    });
    const pinnedVersion = await agentRepository.getPublishedVersion(agentId);

    // Two agent nodes so the session revisits the same agent after a caller turn —
    // the publish below happens between the first and second agent exchange.
    const wf = workflow({
      nodes: [
        node('n1', 'trigger', 'Start'),
        node('n2', 'agent', 'First exchange', { ref: { type: 'agent', id: agentId } }),
        node('n3', 'agent', 'Second exchange', { ref: { type: 'agent', id: agentId } }),
        node('n4', 'end', 'Done'),
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
        { id: 'e3', source: 'n3', target: 'n4' },
      ],
    });

    let publishedMidSession = false;
    const publishMidwaySource: StimulusSource = {
      peekInterrupts: () => false,
      nextCallerTurn: async () => {
        if (!publishedMidSession) {
          publishedMidSession = true;
          await agentRepository.updateDraft(agentId, {
            instructions: { Identity: 'Changed after the session pinned its version.' },
          });
          await agentRepository.publish(agentId);
        }
        return { kind: 'turn', turn: { text: 'continue' } };
      },
    };

    const { recorder } = newRecorder();
    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: publishMidwaySource,
      agentRepository,
    });

    expect(publishedMidSession).toBe(true);
    const latestPublished = await agentRepository.getPublishedVersion(agentId);
    expect(latestPublished?.versionId).not.toBe(pinnedVersion?.versionId); // a newer version really exists now

    const startedEvents = recorder.list().filter((event) => event.type === 'agent.started');
    expect(startedEvents).toHaveLength(2);
    for (const event of startedEvents) {
      expect(event.agentVersionId).toBe(pinnedVersion?.versionId);
    }
  });

  it('every event in a single-agent run carries the pinned agentId and agentVersionId', async () => {
    const agentId = await seedPublishedAgent(agentRepository);
    const wf = singleAgentWorkflow(agentId);
    const published = await agentRepository.getPublishedVersion(agentId);
    const { recorder } = newRecorder();

    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: fixedTurnSource(),
      agentRepository,
    });

    const events = recorder.list();
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.agentId).toBe(agentId);
      expect(event.agentVersionId).toBe(published?.versionId);
    }
  });

  it("every event carries the run's workflowId and workflowVersion", async () => {
    const agentId = await seedPublishedAgent(agentRepository);
    const wf = singleAgentWorkflow(agentId);
    const { recorder } = newRecorder();

    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: fixedTurnSource(),
      agentRepository,
    });

    const events = recorder.list();
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(event.workflowId).toBe(wf.id);
      expect(event.workflowVersion).toBe(wf.version);
    }
  });

  it('fails explicitly, before any event is recorded, when the workflow references an agent that does not exist', async () => {
    const wf = singleAgentWorkflow('no-such-agent');
    const { recorder } = newRecorder();

    await expect(
      runConversationSession({
        workflow: wf,
        runtime: createMockRuntime({ agentRepository }),
        recorder,
        runId: nextRunId(),
        stimulusSource: fixedTurnSource(),
        agentRepository,
      }),
    ).rejects.toThrow();
    expect(recorder.list()).toHaveLength(0);
  });

  it('fails explicitly when the agent exists but has never been published', async () => {
    const agent = await agentRepository.createAgent({ name: 'Unpublished Agent' });
    const wf = singleAgentWorkflow(agent.agentId);
    const { recorder } = newRecorder();

    await expect(
      runConversationSession({
        workflow: wf,
        runtime: createMockRuntime({ agentRepository }),
        recorder,
        runId: nextRunId(),
        stimulusSource: fixedTurnSource(),
        agentRepository,
      }),
    ).rejects.toThrow();
    expect(recorder.list()).toHaveLength(0);
  });

  it('the runtime resolves the published snapshot, never a live draft edit made after publish', async () => {
    const agentId = await seedPublishedAgent(agentRepository, {
      instructions: { Identity: 'Published identity.' },
    });
    // Edited but never published — must not affect what the runtime resolves.
    await agentRepository.updateDraft(agentId, {
      instructions: { Identity: 'Unpublished draft edit.' },
    });

    const wf = singleAgentWorkflow(agentId);
    const { recorder } = newRecorder();
    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: fixedTurnSource(),
      agentRepository,
    });

    const responded = recorder.list().find((event) => event.type === 'agent.responded') as
      Extract<ExecutionEvent, { type: 'agent.responded' }> | undefined;
    expect(responded?.text).toContain('Published identity.');
    expect(responded?.text).not.toContain('Unpublished draft edit.');
  });
});

// Provenance audit follow-up: single-agent EventIdentity defaults (agentId/
// agentVersionId) are a convenience view, not the source of truth — they're absent for
// multi-agent runs by design (see EventIdentity's doc comment in workflow-events.ts).
// These tests confirm the *complete* agentId -> agentVersionId binding survives on the
// canonical stream regardless: durable on run.started's own payload, reconstructable
// without ever consulting AgentRepository, and correct per node even when nodes for
// different agents interleave or a branch goes entirely unvisited.
describe('Multi-agent runtime provenance (Phase 2 follow-up)', () => {
  let agentRepository: AgentRepository;

  beforeEach(() => {
    agentRepository = freshAgentRepository();
  });

  /** trigger -> agent(agent1Id) -> agent(agent2Id) -> end — both agents invoked. */
  function twoAgentSequentialWorkflow(agent1Id: string, agent2Id: string): Workflow {
    return workflow({
      nodes: [
        node('n1', 'trigger', 'Start'),
        node('n2', 'agent', 'First agent', { ref: { type: 'agent', id: agent1Id } }),
        node('n3', 'agent', 'Second agent', { ref: { type: 'agent', id: agent2Id } }),
        node('n4', 'end', 'Done'),
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
        { id: 'e3', source: 'n3', target: 'n4' },
      ],
    });
  }

  /**
   * trigger -> decision -> [agent(agent1Id) | agent(agent2Id)] -> end. Neither edge out
   * of the decision node carries a condition, so the `decision` executor's fallback
   * (`outgoing.find(edge => !edge.condition)`) deterministically always takes the
   * first-declared edge — to n3/agent1. n4/agent2 is a real reference in the workflow
   * definition that this particular run never visits.
   */
  function branchingTwoAgentWorkflow(agent1Id: string, agent2Id: string): Workflow {
    return workflow({
      nodes: [
        node('n1', 'trigger', 'Start'),
        node('n2', 'decision', 'Pick a branch'),
        node('n3', 'agent', 'Branch A agent', { ref: { type: 'agent', id: agent1Id } }),
        node('n4', 'agent', 'Branch B agent (never visited)', {
          ref: { type: 'agent', id: agent2Id },
        }),
        node('n5', 'end', 'Done'),
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
        { id: 'e3', source: 'n2', target: 'n4' },
        { id: 'e4', source: 'n3', target: 'n5' },
        { id: 'e5', source: 'n4', target: 'n5' },
      ],
    });
  }

  it('captures the complete agentId -> agentVersionId binding for a two-agent workflow on run.started', async () => {
    const agent1Id = await seedPublishedAgent(agentRepository, {}, 'Agent One');
    const agent2Id = await seedPublishedAgent(agentRepository, {}, 'Agent Two');
    const v1 = await agentRepository.getPublishedVersion(agent1Id);
    const v2 = await agentRepository.getPublishedVersion(agent2Id);
    const wf = twoAgentSequentialWorkflow(agent1Id, agent2Id);
    const { recorder } = newRecorder();

    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: fixedTurnSource(),
      agentRepository,
    });

    const started = recorder.list().find((event) => event.type === 'run.started') as
      Extract<ExecutionEvent, { type: 'run.started' }> | undefined;
    expect(started?.agentVersions).toEqual({
      [agent1Id]: v1?.versionId,
      [agent2Id]: v2?.versionId,
    });
    // The single-agent convenience default must NOT be the only representation — for a
    // two-agent run it's correctly absent, while the complete binding above is present.
    expect(started?.agentId).toBeUndefined();
    expect(started?.agentVersionId).toBeUndefined();
  });

  it("gives every agent-specific event the exact agentId/agentVersionId it actually used, never the other agent's", async () => {
    const agent1Id = await seedPublishedAgent(agentRepository, {}, 'Agent One');
    const agent2Id = await seedPublishedAgent(agentRepository, {}, 'Agent Two');
    const v1 = await agentRepository.getPublishedVersion(agent1Id);
    const v2 = await agentRepository.getPublishedVersion(agent2Id);
    const wf = twoAgentSequentialWorkflow(agent1Id, agent2Id);
    const { recorder } = newRecorder();

    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: fixedTurnSource(),
      agentRepository,
    });

    const startedEvents = recorder
      .list()
      .filter((event) => event.type === 'agent.started') as Extract<
      ExecutionEvent,
      { type: 'agent.started' }
    >[];
    const respondedEvents = recorder
      .list()
      .filter((event) => event.type === 'agent.responded') as Extract<
      ExecutionEvent,
      { type: 'agent.responded' }
    >[];

    expect(startedEvents).toHaveLength(2);
    expect(startedEvents[0]).toMatchObject({ agentId: agent1Id, agentVersionId: v1?.versionId });
    expect(startedEvents[1]).toMatchObject({ agentId: agent2Id, agentVersionId: v2?.versionId });

    expect(respondedEvents).toHaveLength(2);
    expect(respondedEvents[0]).toMatchObject({ agentId: agent1Id, agentVersionId: v1?.versionId });
    expect(respondedEvents[1]).toMatchObject({ agentId: agent2Id, agentVersionId: v2?.versionId });
  });

  it('keeps both agents pinned to their session-start versions even after publishing newer versions of both mid-session', async () => {
    const agent1Id = await seedPublishedAgent(agentRepository, {}, 'Agent One');
    const agent2Id = await seedPublishedAgent(agentRepository, {}, 'Agent Two');
    const pinned1 = await agentRepository.getPublishedVersion(agent1Id);
    const pinned2 = await agentRepository.getPublishedVersion(agent2Id);
    const wf = twoAgentSequentialWorkflow(agent1Id, agent2Id);

    let republished = false;
    const publishBothMidwaySource: StimulusSource = {
      peekInterrupts: () => false,
      nextCallerTurn: async () => {
        if (!republished) {
          republished = true;
          await agentRepository.updateDraft(agent1Id, { voice: 'Changed after pin' });
          await agentRepository.publish(agent1Id);
          await agentRepository.updateDraft(agent2Id, { voice: 'Changed after pin' });
          await agentRepository.publish(agent2Id);
        }
        return { kind: 'turn', turn: { text: 'continue' } };
      },
    };

    const { recorder } = newRecorder();
    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: publishBothMidwaySource,
      agentRepository,
    });

    expect(republished).toBe(true);
    const latest1 = await agentRepository.getPublishedVersion(agent1Id);
    const latest2 = await agentRepository.getPublishedVersion(agent2Id);
    expect(latest1?.versionId).not.toBe(pinned1?.versionId);
    expect(latest2?.versionId).not.toBe(pinned2?.versionId);

    // agent1's node runs before the republish; agent2's runs after — both must still
    // reflect the versions resolved at session start, not the newer ones.
    const responded = recorder
      .list()
      .filter((event) => event.type === 'agent.responded') as Extract<
      ExecutionEvent,
      { type: 'agent.responded' }
    >[];
    expect(responded).toHaveLength(2);
    expect(responded[0].agentVersionId).toBe(pinned1?.versionId);
    expect(responded[1].agentVersionId).toBe(pinned2?.versionId);

    const started = recorder.list().find((event) => event.type === 'run.started') as
      Extract<ExecutionEvent, { type: 'run.started' }> | undefined;
    expect(started?.agentVersions).toEqual({
      [agent1Id]: pinned1?.versionId,
      [agent2Id]: pinned2?.versionId,
    });
  });

  it('reconstructs complete multi-agent provenance from the event stream alone, including an agent whose branch was never visited', async () => {
    const agent1Id = await seedPublishedAgent(agentRepository, {}, 'Branch A Agent');
    const agent2Id = await seedPublishedAgent(agentRepository, {}, 'Branch B Agent');
    const v1 = await agentRepository.getPublishedVersion(agent1Id);
    const v2 = await agentRepository.getPublishedVersion(agent2Id);
    const wf = branchingTwoAgentWorkflow(agent1Id, agent2Id);
    const { recorder } = newRecorder();

    await runConversationSession({
      workflow: wf,
      runtime: createMockRuntime({ agentRepository }),
      recorder,
      runId: nextRunId(),
      stimulusSource: fixedTurnSource(),
      agentRepository,
    });

    const events = recorder.list();
    // Only agent1's branch actually ran — reading agent.started/agent.responded alone
    // would miss agent2 entirely.
    const agentIdsSeenPerNode = new Set(
      events
        .filter((event) => event.type === 'agent.started')
        .map((event) => (event as Extract<ExecutionEvent, { type: 'agent.started' }>).agentId),
    );
    expect(agentIdsSeenPerNode).toEqual(new Set([agent1Id]));

    // But run.started's complete binding — reconstructed from the event stream alone,
    // no repository call — still names both agents and their pinned versions.
    const started = events.find((event) => event.type === 'run.started') as
      Extract<ExecutionEvent, { type: 'run.started' }> | undefined;
    expect(started?.agentVersions).toEqual({
      [agent1Id]: v1?.versionId,
      [agent2Id]: v2?.versionId,
    });
  });

  it("MockAgentRuntime resolves only the exact pinned version id it's given — never a fresh 'latest published' lookup", async () => {
    // If MockAgentRuntime ever called getPublishedVersion(agentId) internally instead
    // of resolving the exact agentVersionId it was handed, this repository would answer
    // with the newer version below and the assertions in the mid-session pinning tests
    // above would fail. This test names that invariant directly, at the contract level,
    // rather than only inferring it from timing-sensitive scenarios.
    const agentId = await seedPublishedAgent(agentRepository, {
      instructions: { Identity: 'Old identity.' },
    });
    const pinned = await agentRepository.getPublishedVersion(agentId);
    await agentRepository.updateDraft(agentId, { instructions: { Identity: 'New identity.' } });
    await agentRepository.publish(agentId);

    const runtime = createMockRuntime({ agentRepository });
    const result = await runtime.agent.respond({
      agentId,
      agentVersionId: pinned!.versionId,
      instruction: 'test instruction',
      context: createInitialContext([]),
      meta: { runId: 'run_test' },
    });

    expect(result.agentVersionId).toBe(pinned?.versionId);
    expect(result.text).toContain('Old identity.');
    expect(result.text).not.toContain('New identity.');
  });
});
