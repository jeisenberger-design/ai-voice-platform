import { describe, expect, it } from 'vitest';
import { validateAgentConfig } from '@/lib/agent-validation';
import type { InstructionSection } from '@/lib/agent-model';

function instructions(
  overrides: Partial<Record<InstructionSection, string>> = {},
): Record<InstructionSection, string> {
  const base: Record<InstructionSection, string> = {
    Identity: '',
    Description: '',
    Purpose: '',
    Personality: '',
    Language: '',
    'Behavior Rules': '',
    'Conversation Rules': '',
    Knowledge: '',
    Tools: '',
    Transfers: '',
    Memory: '',
    Guardrails: '',
    'Output Format': '',
    'Output Schema': '',
  };
  return { ...base, ...overrides };
}

describe('validateAgentConfig', () => {
  it('flags the 4 required sections as errors when empty', () => {
    const results = validateAgentConfig(instructions());
    expect(
      results
        .filter((result) => result.severity === 'error')
        .map((result) => result.section)
        .sort(),
    ).toEqual(['Behavior Rules', 'Identity', 'Purpose', 'Transfers'].sort());
  });

  it('operates on the canonical instructions record alone — no AgentBuilderConfig wrapper needed', () => {
    const results = validateAgentConfig(
      instructions({
        Identity: 'A sufficiently detailed identity description for this agent.',
        Purpose: 'A sufficiently detailed purpose description for this agent.',
        'Behavior Rules': 'A sufficiently detailed behavior rule description here.',
        Transfers: 'A sufficiently detailed transfer policy description here.',
      }),
    );
    expect(results.every((result) => result.severity === 'pass')).toBe(true);
  });

  it('flags a short but non-empty value as a warning, not an error', () => {
    const results = validateAgentConfig(instructions({ Identity: 'short' }));
    expect(results.find((result) => result.section === 'Identity')?.severity).toBe('warning');
  });
});
