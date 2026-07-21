// Workflow execution / state model.
//
// simulateWorkflowRun is the single, runtime-agnostic entry point. It threads a
// WorkflowContext through the graph by delegating each node to its NodeExecutor,
// following the edge each executor selects (data-driven at decisions). It returns an
// ordered run with per-step I/O, condition evaluations, variable deltas, and a context
// snapshot, plus the final context. A real engine can replace the executors without
// changing this function's signature or the UI that consumes its output.

import type { Workflow, WorkflowNode, WorkflowNodeKind } from '@/lib/mock-workflows';
import { createInitialContext, type WorkflowContext } from '@/lib/workflow-context';
import { executors, type ConditionEval, type ExecutionResult, type ToolIO } from '@/lib/workflow-executors';

export type NodeRunStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type WorkflowRunStep = {
  nodeId: string;
  kind: WorkflowNodeKind;
  label: string;
  detail: string;
  io?: ToolIO;
  conditionEvals?: ConditionEval[];
  variablesSet?: Record<string, string | number | boolean>;
  contextSnapshot: WorkflowContext;
};

export type WorkflowRun = {
  workflowId: string;
  path: string[];
  steps: WorkflowRunStep[];
  finalContext: WorkflowContext;
};

export function simulateWorkflowRun(workflow: Workflow): WorkflowRun {
  const nodesById = new Map<string, WorkflowNode>(workflow.nodes.map((node) => [node.id, node]));
  const path: string[] = [];
  const steps: WorkflowRunStep[] = [];
  let context: WorkflowContext = createInitialContext(workflow.variables);

  let current: WorkflowNode | undefined = workflow.nodes.find((node) => node.kind === 'trigger') ?? workflow.nodes[0];
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push(current.id);

    const outgoing = workflow.edges.filter((edge) => edge.source === current!.id);
    const result: ExecutionResult = executors[current.kind]({ node: current, context, outgoing });
    context = result.context;

    steps.push({
      nodeId: current.id,
      kind: current.kind,
      label: current.label,
      detail: result.detail,
      io: result.io,
      conditionEvals: result.conditionEvals,
      variablesSet: result.variablesSet,
      contextSnapshot: context,
    });

    if (current.kind === 'end' || !result.nextEdgeId) break;
    const edge = workflow.edges.find((candidate) => candidate.id === result.nextEdgeId);
    current = edge ? nodesById.get(edge.target) : undefined;
  }

  return { workflowId: workflow.id, path, steps, finalContext: context };
}
