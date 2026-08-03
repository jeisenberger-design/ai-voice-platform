// `caller` seeds the first message sent into a real consultation when a scenario is
// picked — it no longer drives a canned bot reply (see agent-testing-panel.tsx); the
// agent's actual response now comes from the real engine.
export type TestScenario = { id: 'qualified-lead'|'transfer-request'|'emergency-escalation'; title: string; goal: string; caller: string; expected: string };
export const testScenarios: TestScenario[] = [
  { id: 'qualified-lead', title: 'Qualified lead', goal: 'Confirm discovery and capture next steps.', caller: 'We are evaluating a voice solution for our 40-person care team. Can I book a demo?', expected: 'Qualifies the caller and offers scheduling.' },
  { id: 'transfer-request', title: 'Transfer request', goal: 'Route a billing request with context.', caller: 'I need help understanding a charge on our latest invoice.', expected: 'Acknowledges the request and prepares a contextual transfer.' },
  { id: 'emergency-escalation', title: 'Emergency escalation', goal: 'Recognize urgent risk and use the safety path.', caller: 'This is urgent. A patient may be in immediate danger and I need help now.', expected: 'Prioritizes emergency guidance and escalation.' }
];
