// Projections over the execution event stream.
//
// Every read model the UI needs is a pure function of the same immutable events —
// there are no parallel data structures to keep in sync. Timeline is the raw ordered
// stream; State, Tool Calls, and Conversation are the projections below; run state
// (path, context) is likewise derived. Future Analytics is just another projection.

import type { ConversationTurn, WorkflowContext, WorkflowValue } from '@/lib/workflow-context';
import type { ContextScope } from '@/lib/workflow-context';
import type { ExecutionEvent } from '@/lib/workflow-events';

export type StateTransition = { seq: number; t: number; nodeId?: string; scope: ContextScope; key: string; from?: WorkflowValue; to?: WorkflowValue };
export type ToolCall = { stepId?: string; nodeId?: string; t: number; toolId: string; toolName: string; inputs: Record<string, WorkflowValue>; outputs?: Record<string, WorkflowValue> };

export function projectPath(events: readonly ExecutionEvent[]): string[] {
  return events.filter((event) => event.type === 'node.entered' && event.nodeId).map((event) => event.nodeId as string);
}

export function projectContext(events: readonly ExecutionEvent[]): WorkflowContext {
  const started = events.find((event) => event.type === 'run.started');
  const base = started && started.type === 'run.started' ? started.initial : { variables: {}, session: {}, metadata: {} };
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
      return { seq: change.seq, t: change.t, nodeId: change.nodeId, scope: change.scope, key: change.key, from: change.from, to: change.to };
    });
}

export function projectToolCalls(events: readonly ExecutionEvent[]): ToolCall[] {
  const byStep = new Map<string, ToolCall>();
  const order: string[] = [];
  for (const event of events) {
    const stepKey = event.stepId ?? event.eventId;
    if (event.type === 'tool.invoked') {
      byStep.set(stepKey, { stepId: event.stepId, nodeId: event.nodeId, t: event.t, toolId: event.toolId, toolName: event.toolName, inputs: event.inputs });
      order.push(stepKey);
    } else if (event.type === 'tool.returned') {
      const existing = byStep.get(stepKey);
      if (existing) existing.outputs = event.outputs;
      else {
        byStep.set(stepKey, { stepId: event.stepId, nodeId: event.nodeId, t: event.t, toolId: event.toolId, toolName: event.toolName, inputs: {}, outputs: event.outputs });
        order.push(stepKey);
      }
    }
  }
  return order.map((key) => byStep.get(key) as ToolCall);
}

export function projectConversation(events: readonly ExecutionEvent[]): ConversationTurn[] {
  return events
    .filter((event) => event.type === 'conversation.turn')
    .map((event) => {
      const turn = event as Extract<ExecutionEvent, { type: 'conversation.turn' }>;
      return { speaker: turn.speaker, text: turn.text };
    });
}
