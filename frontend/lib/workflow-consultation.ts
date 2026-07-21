// consultWorkflow — the core execution primitive (see
// documentation/conversation-runtime-design.md).
//
// A consultation advances the graph from a cursor via the unchanged NodeExecutor
// contract until it reaches a wait point (or the end), then returns control — it never
// walks a workflow to completion by itself. The engine owns policy evaluation, graph
// traversal, decisions, and tool planning; it never owns time, turns, or interruption.
// Those belong to the Conversation Runtime (lib/conversation-runtime.ts), which decides
// what stimulus to supply next and when to resume.

import type { Workflow, WorkflowNode, WorkflowNodeKind } from '@/lib/mock-workflows';
import type { ContextScope, WorkflowContext } from '@/lib/workflow-context';
import type { Cursor, Directive, Stimulus } from '@/lib/conversation-types';
import { ExecutionRecorder, type ExecutionEvent } from '@/lib/workflow-events';
import { executors, type ExecutionResult } from '@/lib/workflow-executors';
import type { PlatformRuntime } from '@/lib/runtime/contracts';

export type WaitReason = 'agent_turn' | 'transfer' | 'async_tool';

/**
 * Node kinds that must return control to the Conversation Runtime once they finish,
 * and why. `null` means the node never pauses — the consultation continues through it.
 * `end` is deliberately absent: it terminates the consultation (`status: 'completed'`)
 * rather than pausing it. `tool` pauses only once ToolRuntime supports `mode: 'async'`;
 * every tool call today is synchronous, so it never appears here yet.
 */
const WAIT_POINT_REASON: Record<WorkflowNodeKind, WaitReason | null> = {
  trigger: null,
  agent: 'agent_turn',
  tool: null,
  knowledge: null,
  decision: null,
  transfer: 'transfer',
  message: null,
  end: null,
};

export type ConsultationResult = {
  consultationId: string;
  status: 'paused' | 'completed';
  /** Where the next consultation resumes. Meaningless when status is 'completed'. */
  cursor: Cursor;
  context: WorkflowContext;
  /** Accumulated across every node walked this consultation, not just the pausing one. */
  directives: Directive[];
  /** Present iff status is 'paused' — why control is returning. */
  waitReason?: WaitReason;
  /** This consultation's contiguous slice of the run's event stream. */
  events: ExecutionEvent[];
};

export type ConsultWorkflowInput = {
  workflow: Workflow;
  context: WorkflowContext;
  stimulus: Stimulus;
  cursor: Cursor;
  runtime: PlatformRuntime;
  recorder: ExecutionRecorder;
  runId: string;
  consultationId: string;
  /** The event that caused this consultation: run.started, or the prior consultation's pause. */
  causeEventId: string;
};

const SCOPES: ContextScope[] = ['variables', 'session', 'metadata'];

function emitStateChanges(
  recorder: ExecutionRecorder,
  prev: WorkflowContext,
  next: WorkflowContext,
  options: { nodeId: string; stepId: string; parentEventId: string; consultationId: string },
) {
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

// Directives are synthesized here, not returned by NodeExecutor — they represent what
// the Conversation Runtime must say/do, which is a conversation-layer concept, kept out
// of the stable executor contract.
function directivesForNode(node: WorkflowNode, result: ExecutionResult, context: WorkflowContext): Directive[] {
  switch (node.kind) {
    case 'agent':
      return result.agent ? [{ kind: 'speak', text: result.agent.text, interruptible: true }, { kind: 'listen' }] : [];
    case 'message':
      return [{ kind: 'speak', text: node.label, interruptible: false }];
    case 'transfer':
      return [{ kind: 'transfer', target: node.label }];
    case 'end': {
      const outcome = typeof context.variables.outcome === 'string' ? context.variables.outcome : 'completed';
      return [{ kind: 'end', reason: outcome }];
    }
    default:
      return [];
  }
}

function stimulusDetail(stimulus: Stimulus): string | undefined {
  if (stimulus.kind === 'caller.turn') return stimulus.text || undefined;
  if (stimulus.kind === 'tool.result') return stimulus.invocationId;
  if (stimulus.kind === 'timer') return stimulus.timerId;
  return undefined;
}

export async function consultWorkflow(input: ConsultWorkflowInput): Promise<ConsultationResult> {
  const { workflow, stimulus, cursor, runtime, recorder, runId, consultationId, causeEventId } = input;
  const nodesById = new Map<string, WorkflowNode>(workflow.nodes.map((node) => [node.id, node]));
  const startIndex = recorder.list().length;

  const started = recorder.emit(
    { type: 'consultation.started', stimulusKind: stimulus.kind, detail: stimulusDetail(stimulus) },
    { consultationId, parentEventId: causeEventId },
  );

  let context = input.context;
  const directives: Directive[] = [];
  let current: WorkflowNode | undefined =
    cursor.nodeId !== null ? nodesById.get(cursor.nodeId) : (workflow.nodes.find((node) => node.kind === 'trigger') ?? workflow.nodes[0]);
  const visited = new Set<string>();
  let stepIndex = 0;

  const finish = (status: 'paused' | 'completed', resumeCursor: Cursor, waitReason?: WaitReason): ConsultationResult => {
    if (status === 'completed') {
      recorder.emit({ type: 'consultation.completed' }, { consultationId, parentEventId: started.eventId });
    } else if (waitReason) {
      recorder.emit({ type: 'consultation.paused', cursorNodeId: resumeCursor.nodeId, reason: waitReason }, { consultationId, parentEventId: started.eventId });
    }
    return { consultationId, status, cursor: resumeCursor, context, directives, waitReason, events: recorder.list().slice(startIndex) };
  };

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const stepId = `${consultationId}-s${stepIndex.toString().padStart(2, '0')}`;
    stepIndex += 1;

    const entered = recorder.emit(
      { type: 'node.entered', kind: current.kind, label: current.label },
      { nodeId: current.id, stepId, consultationId, parentEventId: started.eventId },
    );
    const stepOptions = { nodeId: current.id, stepId, consultationId, parentEventId: entered.eventId };

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
      recorder.emit({ type: 'tool.invoked', toolId: result.io.toolId, toolName: result.io.toolName, inputs: result.io.inputs }, stepOptions);
      recorder.emit(
        { type: 'tool.returned', toolId: result.io.toolId, toolName: result.io.toolName, outputs: result.io.outputs, latencyMs: result.io.latencyMs },
        { ...stepOptions, latency: result.io.latencyMs },
      );
    }
    for (const evaluation of result.conditionEvals ?? []) {
      recorder.emit({ type: 'condition.evaluated', expression: evaluation.expression, result: evaluation.result, branch: evaluation.branch }, stepOptions);
    }
    emitStateChanges(recorder, prev, context, stepOptions);
    recorder.emit({ type: 'node.exited', kind: current.kind, label: current.label }, stepOptions);

    directives.push(...directivesForNode(current, result, context));

    if (current.kind === 'end' || !result.nextEdgeId) {
      return finish('completed', { nodeId: null });
    }

    const edge = workflow.edges.find((candidate) => candidate.id === result.nextEdgeId);
    if (!edge) return finish('completed', { nodeId: null });

    recorder.emit(
      { type: 'edge.traversed', edgeId: edge.id, sourceId: edge.source, targetId: edge.target, label: edge.label },
      { nodeId: edge.source, stepId, consultationId, parentEventId: entered.eventId },
    );

    const waitReason = WAIT_POINT_REASON[current.kind];
    if (waitReason) {
      return finish('paused', { nodeId: edge.target }, waitReason);
    }

    current = nodesById.get(edge.target);
  }

  return finish('completed', { nodeId: null });
}
