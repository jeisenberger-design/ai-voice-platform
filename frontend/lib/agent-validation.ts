import type { InstructionSection } from '@/lib/agent-model';

export type ValidationResult = {
  section: InstructionSection;
  title: string;
  detail: string;
  severity: 'error' | 'warning' | 'pass';
};
const required: Array<[InstructionSection, string]> = [
  ['Identity', 'Define who the agent is.'],
  ['Purpose', 'Define the goal of each conversation.'],
  ['Behavior Rules', 'Add behavior rules before publishing.'],
  ['Transfers', 'Define how and when the agent transfers a caller.'],
];
export function validateAgentConfig(
  instructions: Record<InstructionSection, string>,
): ValidationResult[] {
  return required.map(([section, detail]) => {
    const value = instructions[section].trim();
    if (!value) return { section, title: `${section} is required`, detail, severity: 'error' };
    if (value.length < 24)
      return {
        section,
        title: `${section} needs more detail`,
        detail: 'Add enough guidance for the agent to act consistently.',
        severity: 'warning',
      };
    return {
      section,
      title: `${section} is configured`,
      detail: 'Ready for a simulated call.',
      severity: 'pass',
    };
  });
}
