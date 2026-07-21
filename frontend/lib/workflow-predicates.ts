// Structured predicate model — the canonical, persisted representation of a condition.
//
// Conditions are always stored as this structured form (never as an evaluated string).
// If human-readable expression authoring is added later, it must PARSE into a Predicate
// rather than replace it. Evaluation reads only the structured model, so there is no
// `eval` and the same predicate can be handed to a real rules engine unchanged.

import { formatValue, resolveOperand, type Operand, type WorkflowContext } from '@/lib/workflow-context';

export type PredicateOperator = '==' | '!=' | '>' | '>=' | '<' | '<=' | 'exists' | 'not_exists';
export type Predicate = { left: Operand; op: PredicateOperator; right?: Operand };

export function evaluatePredicate(context: WorkflowContext, predicate: Predicate): boolean {
  const left = resolveOperand(context, predicate.left);
  if (predicate.op === 'exists') return left !== undefined && left !== '';
  if (predicate.op === 'not_exists') return left === undefined || left === '';
  const right = predicate.right ? resolveOperand(context, predicate.right) : undefined;
  switch (predicate.op) {
    case '==':
      return left === right;
    case '!=':
      return left !== right;
    case '>':
      return Number(left) > Number(right);
    case '>=':
      return Number(left) >= Number(right);
    case '<':
      return Number(left) < Number(right);
    case '<=':
      return Number(left) <= Number(right);
    default:
      return false;
  }
}

function operandLabel(operand: Operand): string {
  return operand.kind === 'literal' ? JSON.stringify(operand.value) : operand.ref.key;
}

export function describePredicate(predicate: Predicate): string {
  if (predicate.op === 'exists') return `${operandLabel(predicate.left)} exists`;
  if (predicate.op === 'not_exists') return `${operandLabel(predicate.left)} is empty`;
  return `${operandLabel(predicate.left)} ${predicate.op} ${predicate.right ? operandLabel(predicate.right) : ''}`.trim();
}

function operandWithValue(context: WorkflowContext, operand: Operand): string {
  if (operand.kind === 'literal') return JSON.stringify(operand.value);
  return `${operand.ref.key}(${formatValue(resolveOperand(context, operand))})`;
}

export function describePredicateWithValues(context: WorkflowContext, predicate: Predicate): string {
  const left = operandWithValue(context, predicate.left);
  if (predicate.op === 'exists') return `${left} exists`;
  if (predicate.op === 'not_exists') return `${left} is empty`;
  const right = predicate.right ? operandWithValue(context, predicate.right) : '';
  return `${left} ${predicate.op} ${right}`.trim();
}
