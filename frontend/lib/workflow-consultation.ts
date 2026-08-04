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
import {
  resolveOperand,
  type ContextScope,
  type WorkflowContext,
  type WorkflowValue,
} from '@/lib/workflow-context';
import type { ConsultationOutcome, Cursor, Directive, Stimulus } from '@/lib/conversation-types';
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
  /**
   * Present iff status is 'completed' — why the consultation stopped advancing.
   * `'end'` is the only outcome a well-formed workflow ever produces; the rest name a
   * specific malformed-graph condition, so the Conversation Runtime can distinguish a
   * true completion from one it should report as a failure.
   */
  outcome?: ConsultationOutcome;
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
  /**
   * agentId -> pinned AgentVersion id, resolved once at session start (see
   * runConversationSession) and unchanged for the run's lifetime. Defaults to `{}` for
   * callers that don't use version pinning (e.g. tests exercising consultation
   * mechanics directly, predating the Agent Model) — those nodes get the 'unknown'
   * sentinel, exactly like today's unresolved-agent fallback.
   */
  pinnedAgentVersions?: Record<string, string>;
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
    // Stable and unique: derived from the step that produced it, not a counter that
    // could collide across nodes or consultations.
    recorder.emit(
      { type: 'conversation.turn', speaker: turn.speaker, text: turn.text },
      { ...options, turnId: `${options.stepId}-turn` },
    );
  }
}

// Directives are synthesized here, not returned by NodeExecutor — they represent what
// the Conversation Runtime must say/do, which is a conversation-layer concept, kept out
// of the stable executor contract.
function directivesForNode(
  node: WorkflowNode,
  result: ExecutionResult,
  context: WorkflowContext,
): Directive[] {
  switch (node.kind) {
    case 'agent':
      return result.agent
        ? [{ kind: 'speak', text: result.agent.text, interruptible: true }, { kind: 'listen' }]
        : [];
    case 'message':
      return [{ kind: 'speak', text: node.label, interruptible: false }];
    case 'transfer':
      return [{ kind: 'transfer', target: node.label }];
    case 'end': {
      const outcome =
        typeof context.variables.outcome === 'string' ? context.variables.outcome : 'completed';
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
  const {
    workflow,
    stimulus,
    cursor,
    runtime,
    recorder,
    runId,
    consultationId,
    causeEventId,
    pinnedAgentVersions = {},
  } = input;
  const nodesById = new Map<string, WorkflowNode>(workflow.nodes.map((node) => [node.id, node]));
  const startIndex = recorder.list().length;

  const started = recorder.emit(
    { type: 'consultation.started', stimulusKind: stimulus.kind, detail: stimulusDetail(stimulus) },
    { consultationId, parentEventId: causeEventId },
  );

  let context = input.context;
  const directives: Directive[] = [];
  let current: WorkflowNode | undefined =
    cursor.nodeId !== null
      ? nodesById.get(cursor.nodeId)
      : (workflow.nodes.find((node) => node.kind === 'trigger') ?? workflow.nodes[0]);
  const visited = new Set<string>();
  let stepIndex = 0;

  const finish = (
    status: 'paused' | 'completed',
    resumeCursor: Cursor,
    waitReason?: WaitReason,
    outcome?: ConsultationOutcome,
  ): ConsultationResult => {
    if (status === 'completed') {
      recorder.emit(
        { type: 'consultation.completed', outcome },
        { consultationId, parentEventId: started.eventId },
      );
    } else if (waitReason) {
      recorder.emit(
        { type: 'consultation.paused', cursorNodeId: resumeCursor.nodeId, reason: waitReason },
        { consultationId, parentEventId: started.eventId },
      );
    }
    return {
      consultationId,
      status,
      cursor: resumeCursor,
      context,
      directives,
      waitReason,
      outcome,
      events: recorder.list().slice(startIndex),
    };
  };

  // `cursor.nodeId` came from a prior `consultation.paused` event; if it no longer
  // resolves to a real node (a stale cursor against an edited definition), that's a
  // malformed-resume condition, not a completion.
  if (cursor.nodeId !== null && !current) {
    return finish('completed', { nodeId: null }, undefined, 'missing_resume_node');
  }

  while (current) {
    if (visited.has(current.id)) {
      // Cycle guard is per consultation — see WAIT_POINT_REASON's doc comment.
      // Reaching an already-visited node without a wait point in between means the
      // graph looped without ever asking the outside world for anything, which the
      // acyclic definition model should never produce.
      return finish('completed', { nodeId: null }, undefined, 'cycle_detected');
    }
    visited.add(current.id);
    const stepId = `${consultationId}-s${stepIndex.toString().padStart(2, '0')}`;
    stepIndex += 1;

    const entered = recorder.emit(
      { type: 'node.entered', kind: current.kind, label: current.label },
      { nodeId: current.id, stepId, consultationId, parentEventId: started.eventId },
    );
    const stepOptions = {
      nodeId: current.id,
      stepId,
      consultationId,
      parentEventId: entered.eventId,
    };

    const prev = context;
    const outgoing = workflow.edges.filter((edge) => edge.source === current!.id);

    // Pre-flight instrumentation: emit the request/start event *before* awaiting the
    // runtime provider, mirroring exactly the gating each executor uses internally, so
    // a "started" event is never a retrospective fiction recorded after the call
    // already finished. This can't live inside the executor without widening the
    // stable NodeExecutor contract, so the gating conditions are intentionally
    // duplicated here in miniature — see workflow-executors.ts for the executors that
    // must keep matching them.
    const agentId = current.ref?.type === 'agent' ? current.ref.id : undefined;
    const agentVersionId = agentId ? (pinnedAgentVersions[agentId] ?? 'unknown') : undefined;
    if (agentId) {
      recorder.emit(
        {
          type: 'agent.started',
          agentId,
          agentVersionId: agentVersionId ?? 'unknown',
          instruction: current.label,
        },
        stepOptions,
      );
    }
    const toolId = current.ref?.type === 'tool' ? current.ref.id : undefined;
    if (toolId) {
      const inputs: Record<string, WorkflowValue> = {};
      for (const binding of current.inputBindings ?? []) {
        const value = resolveOperand(prev, binding.source);
        if (value !== undefined) inputs[binding.param] = value;
      }
      // toolName isn't known until the runtime resolves it; toolId is the truthful
      // value available before the call, same as a real provider integration would see.
      recorder.emit({ type: 'tool.invoked', toolId, toolName: toolId, inputs }, stepOptions);
    }
    if (current.kind === 'knowledge') {
      recorder.emit({ type: 'knowledge.requested', query: current.label }, stepOptions);
    }

    const result: ExecutionResult = await executors[current.kind]({
      node: current,
      context: prev,
      outgoing,
      runtime,
      meta: { runId, nodeId: current.id, stepId },
      workflowId: workflow.id,
      agentVersionId,
    });
    context = result.context;

    if (result.channel) {
      recorder.emit(
        {
          type: 'channel.opened',
          channelSessionId: result.channel.sessionId,
          channel: result.channel.channel,
          provider: result.channel.provider,
        },
        stepOptions,
      );
    }
    if (result.agent) {
      recorder.emit(
        {
          type: 'agent.responded',
          agentId: result.agent.agentId,
          agentVersionId: result.agent.agentVersionId,
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
      recorder.emit(
        {
          type: 'knowledge.retrieved',
          query: result.knowledge.query,
          matches: result.knowledge.matches.map((match) => ({
            source: match.source,
            snippet: match.snippet,
            score: match.score,
          })),
          latencyMs: result.knowledge.latencyMs,
        },
        { ...stepOptions, latency: result.knowledge.latencyMs },
      );
    }
    if (result.io) {
      recorder.emit(
        {
          type: 'tool.returned',
          toolId: result.io.toolId,
          toolName: result.io.toolName,
          outputs: result.io.outputs,
          status: result.io.status,
          error: result.io.error,
          latencyMs: result.io.latencyMs,
        },
        { ...stepOptions, latency: result.io.latencyMs },
      );
    }
    for (const evaluation of result.conditionEvals ?? []) {
      recorder.emit(
        {
          type: 'condition.evaluated',
          expression: evaluation.expression,
          result: evaluation.result,
          branch: evaluation.branch,
        },
        stepOptions,
      );
    }
    emitStateChanges(recorder, prev, context, stepOptions);
    recorder.emit({ type: 'node.exited', kind: current.kind, label: current.label }, stepOptions);

    directives.push(...directivesForNode(current, result, context));

    if (current.kind === 'end') {
      return finish('completed', { nodeId: null }, undefined, 'end');
    }
    if (!result.nextEdgeId) {
      // A non-end node produced no next edge — a dead end in the graph, not a
      // legitimate finish.
      return finish('completed', { nodeId: null }, undefined, 'dead_end');
    }

    const edge = workflow.edges.find((candidate) => candidate.id === result.nextEdgeId);
    if (!edge) {
      return finish('completed', { nodeId: null }, undefined, 'missing_edge');
    }

    recorder.emit(
      {
        type: 'edge.traversed',
        edgeId: edge.id,
        sourceId: edge.source,
        targetId: edge.target,
        label: edge.label,
      },
      { nodeId: edge.source, stepId, consultationId, parentEventId: entered.eventId },
    );

    const waitReason = WAIT_POINT_REASON[current.kind];
    if (waitReason) {
      return finish('paused', { nodeId: edge.target }, waitReason);
    }

    current = nodesById.get(edge.target);
    if (!current) {
      return finish('completed', { nodeId: null }, undefined, 'missing_resume_node');
    }
  }

  // Only reachable if the workflow has no trigger and no nodes at all.
  return finish('completed', { nodeId: null }, undefined, 'missing_resume_node');
}
