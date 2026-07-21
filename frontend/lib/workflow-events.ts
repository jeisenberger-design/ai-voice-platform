// Immutable execution event model — the canonical record of a workflow run.
//
// Events are the source of truth: run state (path, context) and every UI read model
// (timeline, state, tool calls, conversation) are projections over this stream (see
// lib/workflow-projections.ts). Each event carries stable identities so the model
// extends naturally to retries (parentEventId), async execution (runId correlation),
// and nested workflows (parentEventId across runs). The stream is append-only and is
// never mutated after emission.

import type { ContextScope, ConversationTurn, WorkflowValue } from '@/lib/workflow-context';
import type { WorkflowNodeKind } from '@/lib/mock-workflows';

export type ExecutionEventType =
  | 'run.started'
  | 'run.completed'
  | 'node.entered'
  | 'node.exited'
  | 'tool.invoked'
  | 'tool.returned'
  | 'condition.evaluated'
  | 'state.changed'
  | 'conversation.turn'
  | 'edge.traversed'
  // Runtime activity (see lib/runtime/contracts.ts). `tool.invoked`/`tool.returned`
  // already model the tool request/completion pair and are emitted by the ToolRuntime
  // path, so no separate tool.requested/completed synonyms are introduced.
  | 'channel.opened'
  | 'agent.started'
  | 'agent.responded'
  | 'knowledge.requested'
  | 'knowledge.retrieved'
  | 'runtime.completed';

type ContextSnapshot = {
  variables: Record<string, WorkflowValue>;
  session: Record<string, WorkflowValue>;
  metadata: Record<string, WorkflowValue>;
};

export type EventIdentity = {
  runId: string;
  eventId: string;
  parentEventId?: string;
  stepId?: string;
  seq: number;
  t: number;
  nodeId?: string;
};

export type ExecutionEventPayload =
  | { type: 'run.started'; workflowId: string; initial: ContextSnapshot }
  | { type: 'run.completed'; outcome?: string }
  | { type: 'node.entered'; kind: WorkflowNodeKind; label: string }
  | { type: 'node.exited'; kind: WorkflowNodeKind; label: string }
  | { type: 'tool.invoked'; toolId: string; toolName: string; inputs: Record<string, WorkflowValue> }
  | { type: 'tool.returned'; toolId: string; toolName: string; outputs: Record<string, WorkflowValue> }
  | { type: 'condition.evaluated'; expression: string; result: boolean; branch?: string }
  | { type: 'state.changed'; scope: ContextScope; key: string; from?: WorkflowValue; to?: WorkflowValue }
  | { type: 'conversation.turn'; speaker: ConversationTurn['speaker']; text: string }
  | { type: 'edge.traversed'; edgeId: string; sourceId: string; targetId: string; label?: string }
  | { type: 'channel.opened'; sessionId: string; channel: string; provider: string }
  | { type: 'agent.started'; agentId: string; instruction: string }
  | { type: 'agent.responded'; agentId: string; promptVersion: string; model: string; voice: string; text: string; latencyMs: number }
  | { type: 'knowledge.requested'; query: string; sources?: string[] }
  | { type: 'knowledge.retrieved'; query: string; matches: { source: string; snippet: string; score: number }[]; latencyMs: number }
  | { type: 'runtime.completed'; agentCalls: number; toolCalls: number; knowledgeQueries: number; totalLatencyMs: number };

export type ExecutionEvent = EventIdentity & ExecutionEventPayload;

type EmitOptions = { nodeId?: string; stepId?: string; parentEventId?: string; latency?: number };

// Deterministic per-event clock increment (ms) so timelines are stable across runs.
const BASE_TICK = 20;

let runCounter = 0;
export function nextRunId(): string {
  runCounter += 1;
  return `run_${runCounter.toString().padStart(3, '0')}`;
}

// Append-only recorder. Assigns monotonic seq/eventId and advances a simulated clock.
export class ExecutionRecorder {
  private readonly events: ExecutionEvent[] = [];
  private seq = 0;
  private clock = 0;

  constructor(readonly runId: string) {}

  emit(payload: ExecutionEventPayload, options: EmitOptions = {}): ExecutionEvent {
    const seq = this.seq;
    this.seq += 1;
    const event: ExecutionEvent = {
      runId: this.runId,
      eventId: `${this.runId}-e${seq.toString().padStart(3, '0')}`,
      parentEventId: options.parentEventId,
      stepId: options.stepId,
      nodeId: options.nodeId,
      seq,
      t: this.clock,
      ...payload,
    };
    this.clock += BASE_TICK + (options.latency ?? 0);
    this.events.push(event);
    return event;
  }

  list(): readonly ExecutionEvent[] {
    return this.events;
  }
}
