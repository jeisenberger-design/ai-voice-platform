// Deterministic scripted caller turns — phase 3 of the Conversation Runtime (see
// documentation/conversation-runtime-design.md). Each turn is consumed one at a time,
// in order, per 'agent_turn' pause in a run. Workflows with no agent nodes need none.
// This is intentionally data, not a UI concept yet — scenario selection is deferred to
// phase 4.

export type ScriptedTurn = {
  text: string;
  intent?: string;
  /**
   * If true, this turn arrives while the agent's prior speak directive is still
   * (notionally) in progress, cutting it off instead of waiting for it to finish.
   */
  interrupts?: boolean;
};

export type ConversationScenario = {
  id: string;
  label: string;
  turns: ScriptedTurn[];
};

const scenarios: Record<string, ConversationScenario> = {
  wf_sales_qualification: {
    id: 'standard_inquiry',
    label: 'Standard inbound inquiry',
    turns: [{ text: 'Hi, I saw your ad online and I am interested in booking a consultation.', intent: 'general_inquiry' }],
  },
  wf_support_triage: {
    id: 'urgent_escalation',
    label: 'Caller interrupts with an urgent issue',
    turns: [{ text: 'This can not wait, I need help right now!', intent: 'urgent_escalation', interrupts: true }],
  },
};

const fallbackTurn: ScriptedTurn = { text: '' };

export function getScenario(workflowId: string): ConversationScenario | undefined {
  return scenarios[workflowId];
}

/** Returns the scripted turn at `index`, holding on the last turn if the script is shorter. */
export function scenarioTurn(scenario: ConversationScenario | undefined, index: number): ScriptedTurn {
  if (!scenario || scenario.turns.length === 0) return fallbackTurn;
  return scenario.turns[index] ?? scenario.turns[scenario.turns.length - 1];
}
