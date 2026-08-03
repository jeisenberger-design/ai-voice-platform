// Projections over the execution event stream.
//
// Every read model the UI needs is a pure function of the same immutable events —
// there are no parallel data structures to keep in sync. Timeline is the raw ordered
// stream; State, Tool Calls, Conversation, and Turns are the projections below; run
// state (path, context) is likewise derived. Future Analytics is just another
// projection.

import type { TranscriptLine, WorkflowContext, WorkflowValue } from '@/lib/workflow-context';
import type { ContextScope } from '@/lib/workflow-context';
import type { ExecutionEvent } from '@/lib/workflow-events';
import type { ConversationTurn } from '@/lib/conversation-types';

export type StateTransition = {
  seq: number;
  t: number;
  nodeId?: string;
  scope: ContextScope;
  key: string;
  from?: WorkflowValue;
  to?: WorkflowValue;
};
export type ToolCall = {
  stepId?: string;
  nodeId?: string;
  t: number;
  toolId: string;
  toolName: string;
  inputs: Record<string, WorkflowValue>;
  outputs?: Record<string, WorkflowValue>;
};

export function projectPath(events: readonly ExecutionEvent[]): string[] {
  return events
    .filter((event) => event.type === 'node.entered' && event.nodeId)
    .map((event) => event.nodeId as string);
}

export function projectContext(events: readonly ExecutionEvent[]): WorkflowContext {
  const started = events.find((event) => event.type === 'run.started');
  const base =
    started && started.type === 'run.started'
      ? started.initial
      : { variables: {}, session: {}, metadata: {} };
  const context: WorkflowContext = {
    variables: { ...base.variables },
    session: { ...base.session },
    metadata: { ...base.metadata },
    conversation: [],
  };
  for (const event of events) {
    if (event.type === 'state.changed') {
      if (event.to === undefined) delete context[event.scope][event.key];
      else context[event.scope][event.key] = event.to;
    } else if (event.type === 'conversation.turn') {
      context.conversation.push({ speaker: event.speaker, text: event.text });
    }
  }
  return context;
}

export function projectStateTransitions(events: readonly ExecutionEvent[]): StateTransition[] {
  return events
    .filter((event) => event.type === 'state.changed')
    .map((event) => {
      const change = event as Extract<ExecutionEvent, { type: 'state.changed' }>;
      return {
        seq: change.seq,
        t: change.t,
        nodeId: change.nodeId,
        scope: change.scope,
        key: change.key,
        from: change.from,
        to: change.to,
      };
    });
}

export function projectToolCalls(events: readonly ExecutionEvent[]): ToolCall[] {
  const byStep = new Map<string, ToolCall>();
  const order: string[] = [];
  for (const event of events) {
    const stepKey = event.stepId ?? event.eventId;
    if (event.type === 'tool.invoked') {
      byStep.set(stepKey, {
        stepId: event.stepId,
        nodeId: event.nodeId,
        t: event.t,
        toolId: event.toolId,
        toolName: event.toolName,
        inputs: event.inputs,
      });
      order.push(stepKey);
    } else if (event.type === 'tool.returned') {
      const existing = byStep.get(stepKey);
      if (existing) existing.outputs = event.outputs;
      else {
        byStep.set(stepKey, {
          stepId: event.stepId,
          nodeId: event.nodeId,
          t: event.t,
          toolId: event.toolId,
          toolName: event.toolName,
          inputs: {},
          outputs: event.outputs,
        });
        order.push(stepKey);
      }
    }
  }
  return order.map((key) => byStep.get(key) as ToolCall);
}

export function projectConversation(events: readonly ExecutionEvent[]): TranscriptLine[] {
  return events
    .filter((event) => event.type === 'conversation.turn')
    .map((event) => {
      const turn = event as Extract<ExecutionEvent, { type: 'conversation.turn' }>;
      return { speaker: turn.speaker, text: turn.text };
    });
}

/**
 * Folds turn-lifecycle events into ConversationTurn records. `conversation.turn` is
 * the anchor — the only event guaranteed to fire once per turn today (turn.started
 * never fires; handled below only for forward compatibility, opening its own turn
 * rather than guessing it merges with a later conversation.turn, since there's no real
 * data yet to verify that against). Decorating events (interruption, completion,
 * intent) attach to the turn opened most recently within the same consultation;
 * `directive.abandoned` and `turn.completed` carry no turn/speaker link of their own,
 * so they can only corroborate the currently open turn, never assert one
 * independently. `turn.partial` is deliberately not handled — it's ephemeral streaming
 * data, not part of the canonical turn record, and isn't emitted today either.
 */
export function projectTurns(events: readonly ExecutionEvent[]): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let current: ConversationTurn | null = null;
  let currentConsultationId: string | undefined;

  for (const event of events) {
    const sameConsultation =
      current !== null &&
      typeof currentConsultationId === 'string' &&
      event.consultationId === currentConsultationId;

    if (event.type === 'turn.started') {
      current = {
        sessionId: event.sessionId,
        seq: event.seq,
        t: event.t,
        speaker: event.speaker,
        origin: event.origin,
        status: 'in_progress',
        turnId: event.turnId,
      };
      currentConsultationId = event.consultationId;
      turns.push(current);
    } else if (event.type === 'conversation.turn') {
      current = {
        sessionId: event.sessionId,
        seq: event.seq,
        t: event.t,
        speaker: event.speaker,
        text: event.text,
        status: 'completed',
        turnId: event.turnId,
      };
      currentConsultationId = event.consultationId;
      turns.push(current);
    } else if (event.type === 'turn.interrupted' && sameConsultation && current) {
      current.status = 'interrupted';
      current.partialText = event.partialText;
      current.interruptedBy = event.interruptedBy;
    } else if (event.type === 'directive.abandoned' && sameConsultation && current) {
      current.status = 'interrupted';
    } else if (
      event.type === 'turn.completed' &&
      sameConsultation &&
      current &&
      current.speaker === event.speaker
    ) {
      if (current.status !== 'interrupted') current.status = 'completed';
    } else if (event.type === 'intent.detected' && sameConsultation && current) {
      current.intent = event.intent;
      current.intentConfidence = event.confidence;
    }
  }

  return turns;
}
