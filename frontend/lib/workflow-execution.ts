// simulateWorkflowRun — compatibility wrapper, not the execution primitive.
//
//   Workflow Definition → Execution Engine → Runtime Interfaces → External Providers
//
// consultWorkflow (lib/workflow-consultation.ts) is now the core primitive: it advances
// until a wait point, then returns control. This function exists only so existing
// UI/tests keep a single call that runs a full session to completion — it drives
// runConversationSession (lib/conversation-runtime.ts), the shared envelope runner that
// also backs the agent testing panel, so both produce an identical lifecycle shape. A
// real Conversation Runtime replaces MockConversationRuntime; the WorkflowRun shape
// below, and every projection over its `events`, are unaffected by that swap.

import type { Workflow } from '@/lib/mock-workflows';
import type { WorkflowContext } from '@/lib/workflow-context';
import {
  ExecutionRecorder,
  nextRunId,
  nextSessionId,
  type ExecutionEvent,
} from '@/lib/workflow-events';
import { projectPath } from '@/lib/workflow-projections';
import { createMockRuntime } from '@/lib/runtime/mock-runtime';
import type { PlatformRuntime } from '@/lib/runtime/contracts';
import { runConversationSession } from '@/lib/conversation-runtime';
import type { AgentRepository } from '@/lib/agent-repository';

export type NodeRunStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type WorkflowRun = {
  runId: string;
  sessionId: string;
  workflowId: string;
  events: readonly ExecutionEvent[];
  path: string[];
  finalContext: WorkflowContext;
};

export async function simulateWorkflowRun(
  workflow: Workflow,
  runtime: PlatformRuntime = createMockRuntime(),
  agentRepository?: AgentRepository,
): Promise<WorkflowRun> {
  const runId = nextRunId();
  // Phase 2: one run == one session, driven end-to-end by the shared session runner. A
  // real Conversation Runtime will own session lifecycle across many runs/turns.
  const sessionId = nextSessionId();
  const recorder = new ExecutionRecorder(runId, sessionId);

  const { context: finalContext } = await runConversationSession({
    workflow,
    runtime,
    recorder,
    runId,
    agentRepository,
  });

  const events = recorder.list();
  return {
    runId,
    sessionId,
    workflowId: workflow.id,
    events,
    path: projectPath(events),
    finalContext,
  };
}
