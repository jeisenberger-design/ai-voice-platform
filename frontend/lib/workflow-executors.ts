// Node execution contract.
//
// Every node kind has a stable executor: an async function that takes the current
// context, the node's outgoing edges, and the PlatformRuntime, and returns the next
// context plus a record of what happened. Executors never touch provider data directly
// — agent turns, tool calls, knowledge retrieval and channel sessions all go through
// the runtime interfaces, so swapping providers requires no change here.

import type { WorkflowEdge, WorkflowNode } from '@/lib/mock-workflows';
import {
  appendTurn,
  resolveOperand,
  setValue,
  type WorkflowContext,
  type WorkflowValue,
} from '@/lib/workflow-context';
import { describePredicateWithValues, evaluatePredicate } from '@/lib/workflow-predicates';
import type {
  AgentResult,
  ChannelSession,
  KnowledgeResult,
  PlatformRuntime,
  RuntimeCallMeta,
} from '@/lib/runtime/contracts';

export type ConditionEval = { expression: string; result: boolean; branch?: string };
export type ToolIO = {
  toolId: string;
  toolName: string;
  inputs: Record<string, WorkflowValue>;
  outputs: Record<string, WorkflowValue>;
  latencyMs: number;
  status: 'ok' | 'error';
  error?: string;
};

export type ExecutionInput = {
  node: WorkflowNode;
  context: WorkflowContext;
  outgoing: WorkflowEdge[];
  runtime: PlatformRuntime;
  meta: RuntimeCallMeta;
  workflowId: string;
  /**
   * The pinned AgentVersion id for this node's agent ref, resolved once at session
   * start (see runConversationSession) and threaded in by consultWorkflow — never
   * looked up fresh here. Undefined when the node isn't an agent node, or when the
   * caller didn't opt into version pinning (e.g. tests exercising consultation
   * mechanics directly, predating the Agent Model).
   */
  agentVersionId?: string;
};

export type ExecutionResult = {
  context: WorkflowContext;
  detail: string;
  nextEdgeId?: string;
  io?: ToolIO;
  conditionEvals?: ConditionEval[];
  variablesSet?: Record<string, WorkflowValue>;
  agent?: AgentResult;
  knowledge?: KnowledgeResult;
  channel?: ChannelSession;
};

export type NodeExecutor = (input: ExecutionInput) => Promise<ExecutionResult>;

const firstEdgeId = (outgoing: WorkflowEdge[]) => outgoing[0]?.id;

const trigger: NodeExecutor = async ({ node, context, outgoing, runtime, meta, workflowId }) => {
  const session = await runtime.channel.open({ workflowId, meta });
  let next = context;
  const variablesSet: Record<string, WorkflowValue> = {};

  // Channel session metadata first; the fixture's seed then overrides it so scenarios
  // stay deterministic regardless of which channel provider is attached.
  next = setValue(next, { scope: 'session', key: 'callId' }, session.sessionId);
  next = setValue(next, { scope: 'session', key: 'channel' }, session.channel);
  for (const [key, value] of Object.entries(session.caller))
    next = setValue(next, { scope: 'session', key }, value);

  if (node.seed?.session) {
    for (const [key, value] of Object.entries(node.seed.session))
      next = setValue(next, { scope: 'session', key }, value);
  }
  if (node.seed?.variables) {
    for (const [key, value] of Object.entries(node.seed.variables)) {
      next = setValue(next, { scope: 'variables', key }, value);
      variablesSet[key] = value;
    }
  }
  next = appendTurn(next, { speaker: 'system', text: 'Call started' });
  return {
    context: next,
    detail: 'Inbound call received',
    nextEdgeId: firstEdgeId(outgoing),
    variablesSet,
    channel: session,
  };
};

const agent: NodeExecutor = async ({ node, context, outgoing, runtime, meta, agentVersionId }) => {
  const agentId = node.ref?.type === 'agent' ? node.ref.id : undefined;
  if (!agentId) {
    return {
      context: appendTurn(context, { speaker: 'agent', text: node.label }),
      detail: 'Agent turn handled',
      nextEdgeId: firstEdgeId(outgoing),
    };
  }
  const result = await runtime.agent.respond({
    agentId,
    agentVersionId: agentVersionId ?? 'unknown',
    instruction: node.label,
    context,
    meta,
  });
  return {
    context: appendTurn(context, { speaker: 'agent', text: result.text }),
    detail: `Agent responded · ${result.promptVersion}`,
    nextEdgeId: firstEdgeId(outgoing),
    agent: result,
  };
};

const message: NodeExecutor = async ({ node, context, outgoing }) => ({
  context: appendTurn(context, { speaker: 'agent', text: node.label }),
  detail: 'Message delivered',
  nextEdgeId: firstEdgeId(outgoing),
});

const knowledge: NodeExecutor = async ({ node, context, outgoing, runtime, meta }) => {
  const scoped = node.ref?.type === 'knowledge' ? [node.ref.id] : undefined;
  const result = await runtime.knowledge.retrieve({
    query: node.label,
    sources: scoped,
    topK: 2,
    meta,
  });
  return {
    context: appendTurn(context, {
      speaker: 'system',
      text: `Knowledge retrieved (${result.matches.length} matches)`,
    }),
    detail: `Knowledge retrieved · ${result.matches.length} matches`,
    nextEdgeId: firstEdgeId(outgoing),
    knowledge: result,
  };
};

const tool: NodeExecutor = async ({ node, context, outgoing, runtime, meta }) => {
  const toolId = node.ref?.type === 'tool' ? node.ref.id : undefined;
  if (!toolId) return { context, detail: 'Tool not configured', nextEdgeId: firstEdgeId(outgoing) };

  const inputs: Record<string, WorkflowValue> = {};
  for (const binding of node.inputBindings ?? []) {
    const value = resolveOperand(context, binding.source);
    if (value !== undefined) inputs[binding.param] = value;
  }

  const result = await runtime.tool.invoke({ toolId, inputs, meta });

  let next = context;
  const variablesSet: Record<string, WorkflowValue> = {};
  for (const mapping of node.outputMappings ?? []) {
    const value = result.outputs[mapping.output];
    if (value !== undefined) {
      next = setValue(next, mapping.target, value);
      variablesSet[mapping.target.key] = value;
    }
  }

  return {
    context: next,
    detail: result.status === 'ok' ? `${result.toolName} executed` : `${result.toolName} failed`,
    nextEdgeId: firstEdgeId(outgoing),
    io: {
      toolId: result.toolId,
      toolName: result.toolName,
      inputs,
      outputs: result.outputs,
      latencyMs: result.latencyMs,
      status: result.status,
      error: result.error,
    },
    variablesSet: Object.keys(variablesSet).length ? variablesSet : undefined,
  };
};

const decision: NodeExecutor = async ({ node, context, outgoing }) => {
  const conditionEvals: ConditionEval[] = [];
  let chosen: WorkflowEdge | undefined;
  for (const edge of outgoing) {
    if (edge.condition) {
      const result = evaluatePredicate(context, edge.condition);
      conditionEvals.push({
        expression: describePredicateWithValues(context, edge.condition),
        result,
        branch: edge.label,
      });
      if (result && !chosen) chosen = edge;
    }
  }
  if (!chosen) {
    chosen =
      outgoing.find((edge) => edge.else) ?? outgoing.find((edge) => !edge.condition) ?? outgoing[0];
    if (chosen) conditionEvals.push({ expression: 'else', result: true, branch: chosen.label });
  }
  const next = chosen?.label
    ? setValue(context, { scope: 'metadata', key: node.label }, chosen.label)
    : context;
  return {
    context: next,
    detail: chosen?.label ? `Evaluated → ${chosen.label}` : 'Condition evaluated',
    nextEdgeId: chosen?.id,
    conditionEvals,
  };
};

const transfer: NodeExecutor = async ({ node, context, outgoing }) => ({
  context: appendTurn(context, { speaker: 'system', text: `Transfer: ${node.label}` }),
  detail: 'Transfer initiated',
  nextEdgeId: firstEdgeId(outgoing),
});

const end: NodeExecutor = async ({ context }) => {
  const next =
    'outcome' in context.variables
      ? setValue(context, { scope: 'variables', key: 'outcome' }, 'Completed')
      : context;
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
