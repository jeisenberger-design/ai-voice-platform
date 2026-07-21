// simulateWorkflowRun — compatibility wrapper, not the execution primitive.
//
//   Workflow Definition → Execution Engine → Runtime Interfaces → External Providers
//
// consultWorkflow (lib/workflow-consultation.ts) is now the core primitive: it advances
// until a wait point, then returns control. This function exists only so existing
// UI/tests keep a single call that runs a full session to completion — it drives
// MockConversationRuntime (lib/conversation-runtime.ts), which auto-resumes every pause.
// A real Conversation Runtime replaces MockConversationRuntime; the WorkflowRun shape
// below, and every projection over its `events`, are unaffected by that swap.

import type { Workflow } from '@/lib/mock-workflows';
import { createInitialContext, type WorkflowContext } from '@/lib/workflow-context';
import { ExecutionRecorder, nextRunId, nextSessionId, type ExecutionEvent } from '@/lib/workflow-events';
import { projectContext, projectPath } from '@/lib/workflow-projections';
import { createMockRuntime } from '@/lib/runtime/mock-runtime';
import type { PlatformRuntime } from '@/lib/runtime/contracts';
import { MockConversationRuntime } from '@/lib/conversation-runtime';

export type NodeRunStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type WorkflowRun = {
  runId: string;
  sessionId: string;
  workflowId: string;
  events: readonly ExecutionEvent[];
  path: string[];
  finalContext: WorkflowContext;
};

export async function simulateWorkflowRun(workflow: Workflow, runtime: PlatformRuntime = createMockRuntime()): Promise<WorkflowRun> {
  const runId = nextRunId();
  // Phase 2: one run == one session, driven end-to-end by MockConversationRuntime. A
  // real Conversation Runtime will own session lifecycle across many runs/turns.
  const sessionId = nextSessionId();
  const recorder = new ExecutionRecorder(runId, sessionId);

  const initial = createInitialContext(workflow.variables);
  const runStarted = recorder.emit({
    type: 'run.started',
    workflowId: workflow.id,
    initial: { variables: { ...initial.variables }, session: { ...initial.session }, metadata: { ...initial.metadata } },
  });

  const conversationRuntime = new MockConversationRuntime(workflow, runtime, recorder, runId);
  await conversationRuntime.run(initial, runStarted.eventId);

  // Derived from the event stream rather than threaded manually across consultations —
  // the whole point of an event-sourced record is that totals like this are a fold, not
  // accumulator state the driver has to carry.
  const eventsSoFar = recorder.list();
  const agentCalls = eventsSoFar.filter((event) => event.type === 'agent.responded').length;
  const toolCalls = eventsSoFar.filter((event) => event.type === 'tool.returned').length;
  const knowledgeQueries = eventsSoFar.filter((event) => event.type === 'knowledge.retrieved').length;
  const totalLatencyMs = eventsSoFar.reduce((sum, event) => {
    if (event.type === 'agent.responded' || event.type === 'knowledge.retrieved' || event.type === 'tool.returned') return sum + event.latencyMs;
    return sum;
  }, 0);

  recorder.emit({ type: 'runtime.completed', agentCalls, toolCalls, knowledgeQueries, totalLatencyMs }, { parentEventId: runStarted.eventId });

  const finalContext = projectContext(recorder.list());
  recorder.emit({ type: 'run.completed', outcome: typeof finalContext.variables.outcome === 'string' ? finalContext.variables.outcome : undefined }, { parentEventId: runStarted.eventId });

  const events = recorder.list();
  return { runId, sessionId, workflowId: workflow.id, events, path: projectPath(events), finalContext };
}
