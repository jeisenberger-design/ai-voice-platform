// Workflow execution — produces the canonical event stream for a run.
//
// simulateWorkflowRun walks the graph via the NodeExecutor contract (unchanged) and
// records an immutable ExecutionEvent stream as it goes: it diffs the context before
// and after each executor to emit state.changed / conversation.turn events, and wraps
// each executor's tool I/O and condition evaluations as events. The returned
// WorkflowRun keeps `path` and `finalContext` as projections for compatibility, but the
// events are the source of truth. A real engine emits the same schema itself.

import { tools } from '@/lib/mock-tools';
import type { Workflow, WorkflowNode } from '@/lib/mock-workflows';
import { createInitialContext, type ContextScope, type WorkflowContext } from '@/lib/workflow-context';
import { ExecutionRecorder, nextRunId, type ExecutionEvent } from '@/lib/workflow-events';
import { projectContext, projectPath } from '@/lib/workflow-projections';
import { executors, type ExecutionResult } from '@/lib/workflow-executors';

export type NodeRunStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type WorkflowRun = {
  runId: string;
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

export function simulateWorkflowRun(workflow: Workflow): WorkflowRun {
  const runId = nextRunId();
  const recorder = new ExecutionRecorder(runId);
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

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const stepId = `${runId}-s${stepIndex.toString().padStart(2, '0')}`;
    stepIndex += 1;

    const entered = recorder.emit({ type: 'node.entered', kind: current.kind, label: current.label }, { nodeId: current.id, stepId, parentEventId: runStarted.eventId });
    const stepOptions = { nodeId: current.id, stepId, parentEventId: entered.eventId };

    const prev = context;
    const outgoing = workflow.edges.filter((edge) => edge.source === current!.id);
    const result: ExecutionResult = executors[current.kind]({ node: current, context: prev, outgoing });
    context = result.context;

    if (result.io) {
      const toolName = tools.find((tool) => tool.id === result.io!.toolId)?.name ?? result.io.toolId;
      recorder.emit({ type: 'tool.invoked', toolId: result.io.toolId, toolName, inputs: result.io.inputs }, stepOptions);
      recorder.emit({ type: 'tool.returned', toolId: result.io.toolId, toolName, outputs: result.io.outputs }, { ...stepOptions, latency: 120 });
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

  const finalContext = projectContext(recorder.list());
  recorder.emit({ type: 'run.completed', outcome: typeof finalContext.variables.outcome === 'string' ? finalContext.variables.outcome : undefined }, { parentEventId: runStarted.eventId });

  const events = recorder.list();
  return { runId, workflowId: workflow.id, events, path: projectPath(events), finalContext };
}
