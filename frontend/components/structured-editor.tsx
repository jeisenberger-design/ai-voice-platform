'use client';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentTestingPanel } from '@/components/agent-testing-panel';
import { type BuilderSection, useAgentBuilderStore } from '@/stores/agent-builder-store';
import type { InstructionSection } from '@/lib/agent-model';

// Phase 3A migrated exactly these 7 sections to the canonical Agent draft (see
// documentation/agent-model-implementation-plan.md Phase 3A) — identity, personality,
// conversation rules, transfers, memory, guardrails, output schema. Knowledge and
// Tools stay on the legacy Zustand store deliberately: those names overlap with the
// separately-scoped knowledge-source-selection and enabled-tools capability work
// (Agent.knowledgeSourceIds/toolIds), not yet migrated. See agent-builder-store.ts's
// header comment for this compatibility adapter's exact removal condition.
const MIGRATED_SECTIONS = new Set<InstructionSection>([
  'Identity',
  'Personality',
  'Conversation Rules',
  'Transfers',
  'Memory',
  'Guardrails',
  'Output Schema',
]);
const LEGACY_SECTIONS = new Set<BuilderSection>(['Knowledge', 'Tools']);

export function StructuredEditor({
  sections,
  agentId,
  instructions,
  onChangeSection,
}: {
  sections: string[];
  agentId: string;
  /** The canonical draft's instructions, merged with any unsaved staged edits. */
  instructions: Record<InstructionSection, string>;
  onChangeSection: (section: InstructionSection, value: string) => void;
}) {
  const [active, setActive] = useState(sections[0]);
  // Legacy store — still authoritative for Knowledge/Tools (and the dead Voice
  // Settings branch below, unreachable via any tab this component is ever given).
  const legacyConfig = useAgentBuilderStore(agentId, (state) => state.config);
  const legacyUpdateSection = useAgentBuilderStore(agentId, (state) => state.updateSection);
  const legacyUpdateSetting = useAgentBuilderStore(agentId, (state) => state.updateSetting);
  return (
    <div className="grid gap-6 lg:grid-cols-[210px_1fr]">
      <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
        {sections.map((section, i) => (
          <button
            key={section}
            onClick={() => setActive(section)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted lg:w-full',
              active === section && 'bg-muted text-foreground font-medium',
            )}
          >
            <span className="text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
            {section}
          </button>
        ))}
      </nav>
      {active === 'Testing' ? (
        <AgentTestingPanel agentId={agentId} />
      ) : (
        <section className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-medium">{active}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {descriptions[active] ??
                  'Define how your agent handles this part of the conversation.'}
              </p>
            </div>
            <ChevronRight size={18} className="text-muted-foreground" />
          </div>
          <div className="space-y-5 p-5">
            {active === 'Voice Settings' ? (
              <>
                <Field label="Voice">
                  <select
                    value={legacyConfig.voice}
                    onChange={(event) => legacyUpdateSetting('voice', event.target.value)}
                    className="input"
                  >
                    <option>Nova - Clear and warm</option>
                    <option>Alloy - Neutral</option>
                    <option>Shimmer - Bright and engaging</option>
                  </select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Speaking pace">
                    <select
                      value={legacyConfig.pace}
                      onChange={(event) => legacyUpdateSetting('pace', event.target.value)}
                      className="input"
                    >
                      <option>Natural</option>
                      <option>Deliberate</option>
                      <option>Brisk</option>
                    </select>
                  </Field>
                  <Field label="Interruption sensitivity">
                    <select
                      value={legacyConfig.interruptionSensitivity}
                      onChange={(event) =>
                        legacyUpdateSetting('interruptionSensitivity', event.target.value)
                      }
                      className="input"
                    >
                      <option>Balanced</option>
                      <option>Low</option>
                      <option>High</option>
                    </select>
                  </Field>
                </div>
              </>
            ) : MIGRATED_SECTIONS.has(active as InstructionSection) ? (
              <>
                <Field label={`${active} policy`}>
                  <textarea
                    value={instructions[active as InstructionSection] ?? ''}
                    onChange={(event) =>
                      onChangeSection(active as InstructionSection, event.target.value)
                    }
                    className="input min-h-32 resize-y"
                  />
                </Field>
                <Field label="Operating guidance">
                  <input
                    className="input"
                    value="Use concise, helpful language and confirm important details."
                    readOnly
                  />
                </Field>
              </>
            ) : LEGACY_SECTIONS.has(active as BuilderSection) ? (
              <>
                <Field label={`${active} policy`}>
                  <textarea
                    value={legacyConfig.sections[active as BuilderSection] ?? ''}
                    onChange={(event) =>
                      legacyUpdateSection(active as BuilderSection, event.target.value)
                    }
                    className="input min-h-32 resize-y"
                  />
                </Field>
                <Field label="Operating guidance">
                  <input
                    className="input"
                    value="Use concise, helpful language and confirm important details."
                    readOnly
                  />
                </Field>
              </>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
const descriptions: Record<string, string> = {
  'Conversation Rules': 'Define turn-taking, discovery, confirmation, and closing behavior.',
  Memory: 'Set the information the agent should retain within a conversation.',
  Guardrails: 'Set firm operating boundaries and safety behavior.',
  'Output Schema': 'Define the structured result produced after the conversation.',
};
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}
