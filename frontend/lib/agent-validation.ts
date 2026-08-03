import type { AgentBuilderConfig, BuilderSection } from '@/stores/agent-builder-store';

export type ValidationResult = {
  section: BuilderSection;
  title: string;
  detail: string;
  severity: 'error' | 'warning' | 'pass';
};
const required: Array<[BuilderSection, string]> = [
  ['Identity', 'Define who the agent is.'],
  ['Purpose', 'Define the goal of each conversation.'],
  ['Behavior Rules', 'Add behavior rules before publishing.'],
  ['Transfers', 'Define how and when the agent transfers a caller.'],
];
export function validateAgentConfig(config: AgentBuilderConfig): ValidationResult[] {
  return required.map(([section, detail]) => {
    const value = config.sections[section].trim();
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
