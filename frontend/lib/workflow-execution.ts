// Workflow execution — produces the canonical event stream for a run.
//
//   Workflow Definition → Execution Engine → Runtime Interfaces → External Providers
//
// simulateWorkflowRun walks the graph via the NodeExecutor contract, delegating all
// provider work (agent turns, tool calls, knowledge retrieval, channel sessions) to an
// injected PlatformRuntime. It records an immutable ExecutionEvent stream as it goes:
// it diffs the context before and after each executor to emit state.changed /
// conversation.turn events, and wraps runtime activity as events with consistent
// identities. Swapping the mock runtime for real providers requires no change here.

import type { Workflow, WorkflowNode } from '@/lib/mock-workflows';
import { createInitialContext, type ContextScope, type WorkflowContext } from '@/lib/workflow-context';
import { ExecutionRecorder, nextRunId, nextSessionId, type ExecutionEvent } from '@/lib/workflow-events';
import { projectContext, projectPath } from '@/lib/workflow-projections';
import { executors, type ExecutionResult } from '@/lib/workflow-executors';
import { createMockRuntime } from '@/lib/runtime/mock-runtime';
import type { PlatformRuntime } from '@/lib/runtime/contracts';

export type NodeRunStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type WorkflowRun = {
  runId: string;
  sessionId: string;
  workflowId: string;
  events: readonly ExecutionEvent[];
  path: string[];
  finalContext: WorkflowContext;
};

const SCOPES: ContextScope[] = ['variables', 'session', 'metadata'];

function emitStateChanges(recorder: ExecutionRecorder, prev: WorkflowContext, next: WorkflowContext, options: { nodeId: string; stepId: string; parentEventId: string }) {
  for (const scope of SCOPES) {
    const keys = new Set([...Object.keys(prev[scope]), ...Object.keys(next[scope])]);
    for (const key of keys) {
      const from = prev[scope][key];
      const to = next[scope][key];
      if (from !== to) recorder.emit({ type: 'state.changed', scope, key, from, to }, options);
    }
  }
  for (let i = prev.conversation.length; i < next.conversation.length; i += 1) {
    const turn = next.conversation[i];
    recorder.emit({ type: 'conversation.turn', speaker: turn.speaker, text: turn.text }, options);
  }
}

export async function simulateWorkflowRun(workflow: Workflow, runtime: PlatformRuntime = createMockRuntime()): Promise<WorkflowRun> {
  const runId = nextRunId();
  // Phase 1: one run == one session. The Conversation Runtime will own session
  // lifecycle in a later phase; the identity exists now so events are correlatable.
  const sessionId = nextSessionId();
  const recorder = new ExecutionRecorder(runId, sessionId);
  const nodesById = new Map<string, WorkflowNode>(workflow.nodes.map((node) => [node.id, node]));

  let context: WorkflowContext = createInitialContext(workflow.variables);
  const runStarted = recorder.emit({
    type: 'run.started',
    workflowId: workflow.id,
    initial: { variables: { ...context.variables }, session: { ...context.session }, metadata: { ...context.metadata } },
  });

  let current: WorkflowNode | undefined = workflow.nodes.find((node) => node.kind === 'trigger') ?? workflow.nodes[0];
  const visited = new Set<string>();
  let stepIndex = 0;
  let agentCalls = 0;
  let toolCalls = 0;
  let knowledgeQueries = 0;
  let totalLatencyMs = 0;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const stepId = `${runId}-s${stepIndex.toString().padStart(2, '0')}`;
    stepIndex += 1;

    const entered = recorder.emit({ type: 'node.entered', kind: current.kind, label: current.label }, { nodeId: current.id, stepId, parentEventId: runStarted.eventId });
    const stepOptions = { nodeId: current.id, stepId, parentEventId: entered.eventId };

    const prev = context;
    const outgoing = workflow.edges.filter((edge) => edge.source === current!.id);
    const result: ExecutionResult = await executors[current.kind]({
      node: current,
      context: prev,
      outgoing,
      runtime,
      meta: { runId, nodeId: current.id, stepId },
      workflowId: workflow.id,
    });
    context = result.context;

    if (result.channel) {
      recorder.emit({ type: 'channel.opened', channelSessionId: result.channel.sessionId, channel: result.channel.channel, provider: result.channel.provider }, stepOptions);
    }
    if (result.agent) {
      agentCalls += 1;
      totalLatencyMs += result.agent.latencyMs;
      recorder.emit({ type: 'agent.started', agentId: result.agent.agentId, instruction: current.label }, stepOptions);
      recorder.emit(
        {
          type: 'agent.responded',
          agentId: result.agent.agentId,
          promptVersion: result.agent.promptVersion,
          model: result.agent.model,
          voice: result.agent.voice,
          text: result.agent.text,
          latencyMs: result.agent.latencyMs,
        },
        { ...stepOptions, latency: result.agent.latencyMs },
      );
    }
    if (result.knowledge) {
      knowledgeQueries += 1;
      totalLatencyMs += result.knowledge.latencyMs;
      recorder.emit({ type: 'knowledge.requested', query: result.knowledge.query }, stepOptions);
      recorder.emit(
        {
          type: 'knowledge.retrieved',
          query: result.knowledge.query,
          matches: result.knowledge.matches.map((match) => ({ source: match.source, snippet: match.snippet, score: match.score })),
          latencyMs: result.knowledge.latencyMs,
        },
        { ...stepOptions, latency: result.knowledge.latencyMs },
      );
    }
    if (result.io) {
      toolCalls += 1;
      totalLatencyMs += result.io.latencyMs;
      recorder.emit({ type: 'tool.invoked', toolId: result.io.toolId, toolName: result.io.toolName, inputs: result.io.inputs }, stepOptions);
      recorder.emit({ type: 'tool.returned', toolId: result.io.toolId, toolName: result.io.toolName, outputs: result.io.outputs }, { ...stepOptions, latency: result.io.latencyMs });
    }
    for (const evaluation of result.conditionEvals ?? []) {
      recorder.emit({ type: 'condition.evaluated', expression: evaluation.expression, result: evaluation.result, branch: evaluation.branch }, stepOptions);
    }
    emitStateChanges(recorder, prev, context, stepOptions);
    recorder.emit({ type: 'node.exited', kind: current.kind, label: current.label }, stepOptions);

    if (current.kind === 'end' || !result.nextEdgeId) {
      current = undefined;
    } else {
      const edge = workflow.edges.find((candidate) => candidate.id === result.nextEdgeId);
      if (edge) {
        recorder.emit({ type: 'edge.traversed', edgeId: edge.id, sourceId: edge.source, targetId: edge.target, label: edge.label }, { nodeId: edge.source, stepId, parentEventId: entered.eventId });
        current = nodesById.get(edge.target);
      } else {
        current = undefined;
      }
    }
  }

  recorder.emit({ type: 'runtime.completed', agentCalls, toolCalls, knowledgeQueries, totalLatencyMs }, { parentEventId: runStarted.eventId });

  const finalContext = projectContext(recorder.list());
  recorder.emit({ type: 'run.completed', outcome: typeof finalContext.variables.outcome === 'string' ? finalContext.variables.outcome : undefined }, { parentEventId: runStarted.eventId });

  const events = recorder.list();
  return { runId, sessionId, workflowId: workflow.id, events, path: projectPath(events), finalContext };
}
