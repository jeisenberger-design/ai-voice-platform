// Immutable execution event model — the canonical record of a workflow run.
//
// Events are the source of truth: run state (path, context) and every UI read model
// (timeline, state, tool calls, conversation) are projections over this stream (see
// lib/workflow-projections.ts). Each event carries stable identities so the model
// extends naturally to retries (parentEventId), async execution (runId correlation),
// and nested workflows (parentEventId across runs). The stream is append-only and is
// never mutated after emission.

import type { ContextScope, TranscriptLine, WorkflowValue } from '@/lib/workflow-context';
import type { WorkflowNodeKind } from '@/lib/mock-workflows';
import type {
  ChannelKind,
  ConsultationOutcome,
  Directive,
  SessionEndReason,
  Stimulus,
  TurnOrigin,
  TurnSpeaker,
} from '@/lib/conversation-types';

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
  | 'runtime.completed'
  // Conversation Runtime vocabulary (documentation/conversation-runtime-design.md).
  // Declared here so the stream stays canonical for both layers; emitted from phase 2/3.
  | 'session.opened'
  | 'session.ended'
  | 'turn.started'
  | 'turn.partial'
  | 'turn.completed'
  | 'turn.interrupted'
  | 'intent.detected'
  | 'consultation.started'
  | 'consultation.paused'
  | 'consultation.completed'
  | 'directive.issued'
  | 'directive.completed'
  | 'directive.abandoned';

type ContextSnapshot = {
  variables: Record<string, WorkflowValue>;
  session: Record<string, WorkflowValue>;
  metadata: Record<string, WorkflowValue>;
};

/** Bump when the event schema changes in a way persisted streams must account for. */
export const EVENT_SCHEMA_VERSION = 1;

/**
 * Correlation is compositional: `stepId` groups events within one node execution,
 * `consultationId` groups node executions within one policy consultation, `turnId`
 * groups activity within one conversational turn, and `sessionId` groups everything.
 * `parentEventId` carries causality independently of that nesting.
 */
export type EventIdentity = {
  schemaVersion: number;
  sessionId: string;
  runId: string;
  consultationId?: string;
  turnId?: string;
  eventId: string;
  parentEventId?: string;
  stepId?: string;
  nodeId?: string;
  seq: number;
  /** Deterministic simulated clock (ms since run start). */
  t: number;
  /** Wall clock, for correlating with real provider activity later. */
  emittedAt: number;
  /**
   * `ephemeral` events (streaming partials) may be coalesced or dropped at persistence
   * time; `canonical` events are the durable record.
   */
  durability: 'canonical' | 'ephemeral';
};

export type ExecutionEventPayload =
  | { type: 'run.started'; workflowId: string; initial: ContextSnapshot }
  | { type: 'run.completed'; outcome?: string }
  | { type: 'node.entered'; kind: WorkflowNodeKind; label: string }
  | { type: 'node.exited'; kind: WorkflowNodeKind; label: string }
  // `invocationId` pairs invoke/return even when an async result lands turns later.
  | {
      type: 'tool.invoked';
      toolId: string;
      toolName: string;
      inputs: Record<string, WorkflowValue>;
      invocationId?: string;
    }
  | {
      type: 'tool.returned';
      toolId: string;
      toolName: string;
      outputs: Record<string, WorkflowValue>;
      invocationId?: string;
      latencyMs: number;
      status: 'ok' | 'error';
      error?: string;
    }
  | { type: 'condition.evaluated'; expression: string; result: boolean; branch?: string }
  | {
      type: 'state.changed';
      scope: ContextScope;
      key: string;
      from?: WorkflowValue;
      to?: WorkflowValue;
    }
  | { type: 'conversation.turn'; speaker: TranscriptLine['speaker']; text: string }
  | { type: 'edge.traversed'; edgeId: string; sourceId: string; targetId: string; label?: string }
  | { type: 'channel.opened'; channelSessionId: string; channel: string; provider: string }
  | { type: 'agent.started'; agentId: string; instruction: string }
  | {
      type: 'agent.responded';
      agentId: string;
      promptVersion: string;
      model: string;
      voice: string;
      text: string;
      latencyMs: number;
    }
  | { type: 'knowledge.requested'; query: string; sources?: string[] }
  | {
      type: 'knowledge.retrieved';
      query: string;
      matches: { source: string; snippet: string; score: number }[];
      latencyMs: number;
    }
  | {
      type: 'runtime.completed';
      agentCalls: number;
      toolCalls: number;
      knowledgeQueries: number;
      totalLatencyMs: number;
    }
  // Conversation Runtime payloads. Turn/consultation ids live on the identity, not here.
  | {
      type: 'session.opened';
      workflowId: string;
      definitionVersion: string;
      channel: ChannelKind;
      provider: string;
    }
  | { type: 'session.ended'; reason: SessionEndReason }
  | { type: 'turn.started'; speaker: TurnSpeaker; origin: TurnOrigin }
  | { type: 'turn.partial'; text: string }
  | { type: 'turn.completed'; speaker: TurnSpeaker; text: string }
  | { type: 'turn.interrupted'; partialText?: string; interruptedBy?: string }
  | { type: 'intent.detected'; intent: string; confidence?: number }
  | { type: 'consultation.started'; stimulusKind: Stimulus['kind']; detail?: string }
  | { type: 'consultation.paused'; cursorNodeId: string | null; reason: string }
  // `outcome` is present only when the consultation stopped by completing rather than
  // pausing — see ConsultationOutcome for why 'end' is the only outcome a well-formed
  // workflow ever produces.
  | { type: 'consultation.completed'; outcome?: ConsultationOutcome }
  | {
      type: 'directive.issued';
      directiveId: string;
      directiveKind: Directive['kind'];
      summary: string;
    }
  | { type: 'directive.completed'; directiveId: string }
  | { type: 'directive.abandoned'; directiveId: string; reason: string };

export type ExecutionEvent = EventIdentity & ExecutionEventPayload;

type EmitOptions = {
  nodeId?: string;
  stepId?: string;
  parentEventId?: string;
  consultationId?: string;
  turnId?: string;
  durability?: 'canonical' | 'ephemeral';
  latency?: number;
};

// Deterministic per-event clock increment (ms) so timelines are stable across runs.
const BASE_TICK = 20;

let runCounter = 0;
export function nextRunId(): string {
  runCounter += 1;
  return `run_${runCounter.toString().padStart(3, '0')}`;
}

let sessionCounter = 0;
export function nextSessionId(): string {
  sessionCounter += 1;
  return `sess_${sessionCounter.toString().padStart(3, '0')}`;
}

// Append-only recorder. Assigns monotonic seq/eventId and advances a simulated clock.
export class ExecutionRecorder {
  private readonly events: ExecutionEvent[] = [];
  private seq = 0;
  private clock = 0;

  constructor(
    readonly runId: string,
    readonly sessionId: string,
  ) {}

  emit(payload: ExecutionEventPayload, options: EmitOptions = {}): ExecutionEvent {
    const seq = this.seq;
    this.seq += 1;
    const event: ExecutionEvent = {
      schemaVersion: EVENT_SCHEMA_VERSION,
      sessionId: this.sessionId,
      runId: this.runId,
      consultationId: options.consultationId,
      turnId: options.turnId,
      eventId: `${this.runId}-e${seq.toString().padStart(3, '0')}`,
      parentEventId: options.parentEventId,
      stepId: options.stepId,
      nodeId: options.nodeId,
      seq,
      t: this.clock,
      emittedAt: Date.now(),
      durability: options.durability ?? 'canonical',
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
