'use client';
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentTestingPanel } from '@/components/agent-testing-panel';
import { type BuilderSection, useAgentBuilderStore } from '@/stores/agent-builder-store';
const editableSections = new Set<BuilderSection>([
  'Identity',
  'Description',
  'Purpose',
  'Personality',
  'Language',
  'Behavior Rules',
  'Conversation Rules',
  'Knowledge',
  'Tools',
  'Transfers',
  'Memory',
  'Guardrails',
  'Output Format',
  'Output Schema',
]);
export function StructuredEditor({ sections, agentId }: { sections: string[]; agentId: string }) {
  const [active, setActive] = useState(sections[0]);
  const config = useAgentBuilderStore(agentId, (state) => state.config);
  const updateSection = useAgentBuilderStore(agentId, (state) => state.updateSection);
  const updateSetting = useAgentBuilderStore(agentId, (state) => state.updateSetting);
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
                    value={config.voice}
                    onChange={(event) => updateSetting('voice', event.target.value)}
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
                      value={config.pace}
                      onChange={(event) => updateSetting('pace', event.target.value)}
                      className="input"
                    >
                      <option>Natural</option>
                      <option>Deliberate</option>
                      <option>Brisk</option>
                    </select>
                  </Field>
                  <Field label="Interruption sensitivity">
                    <select
                      value={config.interruptionSensitivity}
                      onChange={(event) =>
                        updateSetting('interruptionSensitivity', event.target.value)
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
            ) : editableSections.has(active as BuilderSection) ? (
              <>
                <Field label={`${active} policy`}>
                  <textarea
                    value={config.sections[active as BuilderSection] ?? ''}
                    onChange={(event) =>
                      updateSection(active as BuilderSection, event.target.value)
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
