import { describe, expect, it } from 'vitest';
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
    const scripted = newRecorder();
    await runConversationSession({
      workflow: agentWorkflow,
      runtime: createMockRuntime(),
      recorder: scripted.recorder,
      runId: scripted.runId,
      stimulusSource: fixedTurnSource(),
    });

    const interactive = newRecorder();
    const { source, submit } = createInteractiveStimulusSource();
    await runConversationSession({
      workflow: agentWorkflow,
      runtime: createMockRuntime(),
      recorder: interactive.recorder,
      runId: interactive.runId,
      stimulusSource: source,
      onPause: () => submit('Hello there'),
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
