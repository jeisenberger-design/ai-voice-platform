// Foundational data types + pure helpers for workflow execution state.
//
// WorkflowContext is intentionally structured (not a flat map) so a future runtime
// can populate conversation, session, and metadata independently of workflow-declared
// variables. All helpers are pure and return new context objects.

export type WorkflowValue = string | number | boolean;
export type ValueType = 'string' | 'number' | 'boolean';

export type ContextScope = 'variables' | 'session' | 'metadata';
export type VarRef = { scope: ContextScope; key: string };
export type Operand = { kind: 'ref'; ref: VarRef } | { kind: 'literal'; value: WorkflowValue };

// A single transcript entry — not a conversation-lifecycle object. The canonical
// ConversationTurn (turnId, status, interruption, etc.) lives in conversation-types.ts;
// this is deliberately simpler and named to avoid colliding with it.
export type TranscriptLine = { speaker: 'agent' | 'caller' | 'system'; text: string };

export type WorkflowContext = {
  // Workflow-declared, mutable state that flows between nodes.
  variables: Record<string, WorkflowValue>;
  // Ordered dialogue transcript accumulated during the run.
  conversation: TranscriptLine[];
  // Call identity and channel metadata, seeded at the trigger.
  session: Record<string, WorkflowValue>;
  // Run bookkeeping (e.g. the last decision taken).
  metadata: Record<string, WorkflowValue>;
};

export type WorkflowVariable = {
  name: string;
  type: ValueType;
  initial?: WorkflowValue;
  description?: string;
};
export type TriggerSeed = {
  session?: Record<string, WorkflowValue>;
  variables?: Record<string, WorkflowValue>;
};

const defaultForType = (type: ValueType): WorkflowValue =>
  type === 'number' ? 0 : type === 'boolean' ? false : '';

export function createInitialContext(variables: WorkflowVariable[]): WorkflowContext {
  const vars: Record<string, WorkflowValue> = {};
  for (const declaration of variables) {
    vars[declaration.name] = declaration.initial ?? defaultForType(declaration.type);
  }
  return {
    variables: vars,
    conversation: [],
    session: { callId: 'sim-call', channel: 'Voice' },
    metadata: {},
  };
}

export function resolveOperand(
  context: WorkflowContext,
  operand: Operand,
): WorkflowValue | undefined {
  if (operand.kind === 'literal') return operand.value;
  return context[operand.ref.scope][operand.ref.key];
}

export function setValue(
  context: WorkflowContext,
  ref: VarRef,
  value: WorkflowValue,
): WorkflowContext {
  return { ...context, [ref.scope]: { ...context[ref.scope], [ref.key]: value } };
}

export function appendTurn(context: WorkflowContext, turn: TranscriptLine): WorkflowContext {
  return { ...context, conversation: [...context.conversation, turn] };
}

export function formatValue(value?: WorkflowValue): string {
  if (value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}
