'use client';
// Every section here reads/writes the canonical Agent draft's `instructions` — see
// documentation/agent-model-implementation-plan.md Phase 3B. As of Phase 3B, this
// includes "Knowledge" and "Tools" (previously routed through the now-removed
// stores/agent-builder-store.ts compatibility adapter): those are free-text policy
// sections on AgentVersionConfig.instructions, distinct from the id-based
// Agent.knowledgeSourceIds/toolIds *capability* lists, which live on
// agent-detail-workspace.tsx's separate top-level Knowledge/Tools tabs.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InstructionSection } from '@/lib/agent-model';

export function StructuredEditor({
  sections,
  instructions,
  onChangeSection,
}: {
  sections: string[];
  /** The canonical draft's instructions, merged with any unsaved staged edits. */
  instructions: Record<InstructionSection, string>;
  onChangeSection: (section: InstructionSection, value: string) => void;
}) {
  const [active, setActive] = useState(sections[0]);
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
        </div>
      </section>
    </div>
  );
}
const descriptions: Record<string, string> = {
  'Conversation Rules': 'Define turn-taking, discovery, confirmation, and closing behavior.',
  Knowledge: 'Define how the agent should use its connected knowledge sources.',
  Tools: 'Define when and how the agent may use its enabled tools.',
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
