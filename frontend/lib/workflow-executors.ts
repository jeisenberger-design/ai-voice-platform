// Node execution contract.
//
// Every node kind has a stable executor: a pure function that takes the current context
// and the node's outgoing edges and returns the next context plus a record of what
// happened. Today every executor is mocked, but the contract is the seam a real runtime
// replaces one node kind at a time — the simulator and UI depend only on this shape.

import { tools } from '@/lib/mock-tools';
import type { WorkflowEdge, WorkflowNode } from '@/lib/mock-workflows';
import { appendTurn, resolveOperand, setValue, type WorkflowContext, type WorkflowValue } from '@/lib/workflow-context';
import { describePredicateWithValues, evaluatePredicate } from '@/lib/workflow-predicates';

export type ConditionEval = { expression: string; result: boolean; branch?: string };
export type ToolIO = { toolId: string; inputs: Record<string, WorkflowValue>; outputs: Record<string, WorkflowValue> };

export type ExecutionInput = { node: WorkflowNode; context: WorkflowContext; outgoing: WorkflowEdge[] };
export type ExecutionResult = {
  context: WorkflowContext;
  detail: string;
  nextEdgeId?: string;
  io?: ToolIO;
  conditionEvals?: ConditionEval[];
  variablesSet?: Record<string, WorkflowValue>;
};

export type NodeExecutor = (input: ExecutionInput) => ExecutionResult;

const firstEdgeId = (outgoing: WorkflowEdge[]) => outgoing[0]?.id;

const trigger: NodeExecutor = ({ node, context, outgoing }) => {
  let next = context;
  const variablesSet: Record<string, WorkflowValue> = {};
  if (node.seed?.session) {
    for (const [key, value] of Object.entries(node.seed.session)) next = setValue(next, { scope: 'session', key }, value);
  }
  if (node.seed?.variables) {
    for (const [key, value] of Object.entries(node.seed.variables)) {
      next = setValue(next, { scope: 'variables', key }, value);
      variablesSet[key] = value;
    }
  }
  next = appendTurn(next, { speaker: 'system', text: 'Call started' });
  return { context: next, detail: 'Inbound call received', nextEdgeId: firstEdgeId(outgoing), variablesSet };
};

const agent: NodeExecutor = ({ node, context, outgoing }) => ({
  context: appendTurn(context, { speaker: 'agent', text: node.label }),
  detail: 'Agent turn handled',
  nextEdgeId: firstEdgeId(outgoing),
});

const message: NodeExecutor = ({ node, context, outgoing }) => ({
  context: appendTurn(context, { speaker: 'agent', text: node.label }),
  detail: 'Message delivered',
  nextEdgeId: firstEdgeId(outgoing),
});

const knowledge: NodeExecutor = ({ context, outgoing }) => ({
  context: appendTurn(context, { speaker: 'system', text: 'Knowledge retrieved' }),
  detail: 'Knowledge retrieved',
  nextEdgeId: firstEdgeId(outgoing),
});

const tool: NodeExecutor = ({ node, context, outgoing }) => {
  const definition = tools.find((entry) => entry.id === node.ref?.id);
  if (!definition) return { context, detail: 'Tool not found', nextEdgeId: firstEdgeId(outgoing) };
  const inputs: Record<string, WorkflowValue> = {};
  for (const binding of node.inputBindings ?? []) {
    const value = resolveOperand(context, binding.source);
    if (value !== undefined) inputs[binding.param] = value;
  }
  const outputs = definition.mockResult;
  let next = context;
  const variablesSet: Record<string, WorkflowValue> = {};
  for (const mapping of node.outputMappings ?? []) {
    const value = outputs[mapping.output];
    if (value !== undefined) {
      next = setValue(next, mapping.target, value);
      variablesSet[mapping.target.key] = value;
    }
  }
  return {
    context: next,
    detail: `${definition.name} executed`,
    nextEdgeId: firstEdgeId(outgoing),
    io: { toolId: definition.id, inputs, outputs },
    variablesSet: Object.keys(variablesSet).length ? variablesSet : undefined,
  };
};

const decision: NodeExecutor = ({ node, context, outgoing }) => {
  const conditionEvals: ConditionEval[] = [];
  let chosen: WorkflowEdge | undefined;
  for (const edge of outgoing) {
    if (edge.condition) {
      const result = evaluatePredicate(context, edge.condition);
      conditionEvals.push({ expression: describePredicateWithValues(context, edge.condition), result, branch: edge.label });
      if (result && !chosen) chosen = edge;
    }
  }
  if (!chosen) {
    chosen = outgoing.find((edge) => edge.else) ?? outgoing.find((edge) => !edge.condition) ?? outgoing[0];
    if (chosen) conditionEvals.push({ expression: 'else', result: true, branch: chosen.label });
  }
  const next = chosen?.label ? setValue(context, { scope: 'metadata', key: node.label }, chosen.label) : context;
  return {
    context: next,
    detail: chosen?.label ? `Evaluated → ${chosen.label}` : 'Condition evaluated',
    nextEdgeId: chosen?.id,
    conditionEvals,
  };
};

const transfer: NodeExecutor = ({ node, context, outgoing }) => ({
  context: appendTurn(context, { speaker: 'system', text: `Transfer: ${node.label}` }),
  detail: 'Transfer initiated',
  nextEdgeId: firstEdgeId(outgoing),
});

const end: NodeExecutor = ({ context }) => {
  const next = 'outcome' in context.variables ? setValue(context, { scope: 'variables', key: 'outcome' }, 'Completed') : context;
  return {
    context: next,
    detail: 'Run summary generated',
    variablesSet: 'outcome' in context.variables ? { outcome: 'Completed' } : undefined,
  };
};

export const executors: Record<WorkflowNode['kind'], NodeExecutor> = {
  trigger,
  agent,
  message,
  knowledge,
  tool,
  decision,
  transfer,
  end,
};
