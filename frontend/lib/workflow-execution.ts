// Workflow execution / state model.
//
// This is intentionally decoupled from both the graph model (lib/mock-workflows.ts)
// and from any real runtime. `simulateWorkflowRun` is a pure function that walks a
// workflow graph from its trigger, chooses a branch at each decision, and returns an
// ordered run with accumulated conversation state. The UI visualizes this output; a
// future runtime engine can replace this function without touching components.

import type { Workflow, WorkflowNode, WorkflowNodeKind } from '@/lib/mock-workflows';

export type NodeRunStatus = 'pending' | 'active' | 'completed' | 'skipped';

export type WorkflowRunStep = {
  nodeId: string;
  kind: WorkflowNodeKind;
  label: string;
  detail: string;
  branch?: string;
  variables?: Record<string, string>;
};

export type WorkflowRun = {
  workflowId: string;
  path: string[];
  steps: WorkflowRunStep[];
  variables: Record<string, string>;
};

const stepDetail: Record<WorkflowNodeKind, string> = {
  trigger: 'Inbound call received',
  agent: 'Agent turn handled',
  tool: 'Tool call executed',
  knowledge: 'Knowledge retrieved',
  decision: 'Condition evaluated',
  transfer: 'Transfer initiated',
  message: 'Message delivered',
  end: 'Run summary generated',
};

function slug(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function simulateWorkflowRun(workflow: Workflow): WorkflowRun {
  const nodesById = new Map<string, WorkflowNode>(workflow.nodes.map((node) => [node.id, node]));
  const start = workflow.nodes.find((node) => node.kind === 'trigger') ?? workflow.nodes[0];
  const path: string[] = [];
  const steps: WorkflowRunStep[] = [];
  const variables: Record<string, string> = {};

  let current: WorkflowNode | undefined = start;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push(current.id);

    const outgoing = workflow.edges.filter((edge) => edge.source === current!.id);
    const chosen = outgoing[0];
    const branch = current.kind === 'decision' ? chosen?.label : undefined;

    const delta: Record<string, string> = {};
    if (current.kind === 'trigger') delta.channel = 'Voice';
    if (branch) delta[slug(current.label)] = branch;
    if (current.kind === 'end') delta.outcome = 'Completed';
    Object.assign(variables, delta);

    steps.push({
      nodeId: current.id,
      kind: current.kind,
      label: current.label,
      detail: stepDetail[current.kind],
      branch,
      variables: Object.keys(delta).length ? delta : undefined,
    });

    if (!chosen || current.kind === 'end') break;
    current = nodesById.get(chosen.target);
  }

  return { workflowId: workflow.id, path, steps, variables };
}
