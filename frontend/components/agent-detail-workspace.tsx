'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  FileText,
  History,
  MoreHorizontal,
  Play,
  RotateCcw,
  Save,
  Settings2,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { AgentValidationSummary } from '@/components/agent-validation-summary';
import { AgentPromptStudio } from '@/components/agent-prompt-studio';
import { AgentTestingPanel } from '@/components/agent-testing-panel';
import { StructuredEditor } from '@/components/structured-editor';
import { validateAgentConfig } from '@/lib/agent-validation';
import {
  useAgent,
  useAgentDraft,
  useAgentVersions,
  useUpdateAgentDraft,
} from '@/hooks/use-agent-data';
import type { Agent, AgentVersionConfig, InstructionSection } from '@/lib/agent-model';
import { sources } from '@/lib/mock-data';
import { tools } from '@/lib/mock-tools';
import { cn } from '@/lib/utils';

const tabs = [
  ['Overview', Bot],
  ['Configuration', Settings2],
  ['Prompt Studio', Sparkles],
  ['Knowledge', BookOpen],
  ['Tools', Wrench],
  ['Testing', Play],
  ['Versions', History],
  ['Analytics', Activity],
] as const;
const configSections = [
  'Identity',
  'Personality',
  'Conversation Rules',
  'Knowledge',
  'Tools',
  'Transfers',
  'Memory',
  'Guardrails',
  'Output Schema',
];
const statusVariant: Record<Agent['status'], 'success' | 'neutral' | 'warning'> = {
  Active: 'success',
  Draft: 'neutral',
  Paused: 'warning',
};

export function AgentDetailWorkspace({ agentId }: { agentId: string }) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('Overview');
  const { data: agent, isLoading: agentLoading } = useAgent(agentId);
  const { data: draft } = useAgentDraft(agentId, !agentLoading && !!agent);
  const updateDraft = useUpdateAgentDraft(agentId);

  // Explicit-save staging: edits accumulate here, untouched in the canonical
  // repository, until "Save changes" is clicked — see the Phase 3A save-behavior
  // decision in documentation/agent-model-implementation-plan.md. Plain component
  // state, not Zustand+localStorage, so "unsaved" now genuinely means not yet written
  // anywhere — it disappears on navigation/reload exactly like the beforeunload guard
  // below already warns the user it will.
  const [staged, setStaged] = useState<Partial<Record<InstructionSection, string>>>({});
  const hasUnsavedChanges = Object.keys(staged).length > 0;
  const mergedInstructions = useMemo(
    () => (draft ? { ...draft.instructions, ...staged } : undefined),
    [draft, staged],
  );
  const hasErrors = mergedInstructions
    ? validateAgentConfig(mergedInstructions).some((item) => item.severity === 'error')
    : false;
  const setSectionValue = (section: InstructionSection, value: string) =>
    setStaged((current) => ({ ...current, [section]: value }));
  const save = async () => {
    if (!hasUnsavedChanges) return;
    await updateDraft.mutateAsync({ instructions: staged });
    setStaged({});
  };
  const discard = () => setStaged({});

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const protect = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [hasUnsavedChanges]);
  const back = () => {
    if (
      !hasUnsavedChanges ||
      window.confirm('You have unsaved changes. Leave the builder and discard them?')
    ) {
      if (hasUnsavedChanges) discard();
      window.location.assign('/agents');
    }
  };
  if (agentLoading)
    return (
      <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
        Loading agent…
      </div>
    );
  if (!agent)
    return (
      <Card className="grid min-h-72 place-items-center p-8 text-center">
        <div>
          <Bot className="mx-auto text-muted-foreground" size={28} />
          <h2 className="mt-3 font-medium">Agent not found</h2>
          <p className="mt-1 text-sm text-muted-foreground">No agent matches this id.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => window.location.assign('/agents')}
          >
            <ArrowLeft size={16} className="mr-2" />
            Back to agents
          </Button>
        </div>
      </Card>
    );
  return (
    <>
      <header className="mb-6">
        <button
          onClick={back}
          className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Agents
        </button>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-lg bg-foreground text-background">
              <Bot size={23} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
                <Badge variant={statusVariant[agent.status]}>{agent.status}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {draft?.voice ? `${draft.voice} voice` : 'Voice not configured yet'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasUnsavedChanges && (
              <Button variant="outline" onClick={discard}>
                <RotateCcw size={16} className="mr-2" />
                Discard
              </Button>
            )}
            <Button variant="outline" onClick={() => setTab('Testing')}>
              <Play size={16} className="mr-2" />
              Test agent
            </Button>
            <Button onClick={save} disabled={!hasUnsavedChanges || hasErrors}>
              <Save size={16} className="mr-2" />
              Save changes
            </Button>
            <Button variant="ghost" aria-label="More agent actions">
              <MoreHorizontal size={18} />
            </Button>
          </div>
        </div>
        <nav className="mt-6 flex gap-1 overflow-x-auto border-b">
          {tabs.map(([label, Icon]) => (
            <button
              onClick={() => setTab(label)}
              key={label}
              className={cn(
                'flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm text-muted-foreground transition-colors',
                tab === label
                  ? 'border-foreground text-foreground font-medium'
                  : 'border-transparent hover:text-foreground',
              )}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
      </header>
      {tab === 'Overview' && <Overview agent={agent} onConfigure={() => setTab('Configuration')} />}{' '}
      {tab === 'Configuration' && mergedInstructions && (
        <>
          <AgentValidationSummary instructions={mergedInstructions} />
          <StructuredEditor
            sections={configSections}
            instructions={mergedInstructions}
            onChangeSection={setSectionValue}
          />
        </>
      )}{' '}
      {tab === 'Prompt Studio' && <AgentPromptStudio agentId={agentId} />}{' '}
      {tab === 'Knowledge' && <KnowledgePanel agentId={agentId} />}{' '}
      {tab === 'Tools' && <ToolsPanel agentId={agentId} />}{' '}
      {tab === 'Testing' && <AgentTestingPanel agentId={agentId} />}{' '}
      {tab === 'Versions' && (
        <VersionsPanel agentId={agentId} onOpenPromptStudio={() => setTab('Prompt Studio')} />
      )}{' '}
      {tab === 'Analytics' && <AnalyticsPanel />}
    </>
  );
}

function Overview({ agent, onConfigure }: { agent: Agent; onConfigure: () => void }) {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-2">
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-medium">Operating status</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {agent.name} is{' '}
                {agent.status === 'Active'
                  ? 'live and handling inbound calls'
                  : agent.status === 'Paused'
                    ? 'paused and not taking calls'
                    : 'a draft and has not been published'}
                .
              </p>
            </div>
            <Badge variant={statusVariant[agent.status]}>
              {agent.status === 'Active' ? 'Operational' : agent.status}
            </Badge>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {/* Calls/success-rate/duration have no canonical home yet — the future
                Calls/Analytics projection (see ARCHITECTURE.md's roadmap), not
                something Phase 3A invents. */}
            {[
              ['—', 'Calls this month'],
              ['—', 'Success rate'],
              ['—', 'Avg. duration'],
            ].map(([value, label]) => (
              <div key={label}>
                <p className="text-2xl font-semibold">{value}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Configuration health</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                9 structured behavior systems are configured.
              </p>
            </div>
            <Button variant="outline" onClick={onConfigure}>
              Review configuration
            </Button>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {['Identity', 'Guardrails', 'Output schema', 'Knowledge', 'Transfers', 'Memory'].map(
              (item) => (
                <div
                  className="flex items-center gap-2 rounded-md bg-muted/60 p-3 text-sm"
                  key={item}
                >
                  <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                  {item}
                </div>
              ),
            )}
          </div>
        </Card>
      </div>
      <Card className="p-5">
        <h2 className="font-medium">Recent activity</h2>
        <div className="mt-4 space-y-4">
          {[
            ['Prompt version 14 saved', 'Just now'],
            ['Knowledge source synced', '1 hour ago'],
            ['Test call completed', 'Yesterday'],
            ['Version 13 published', 'Jul 14'],
          ].map(([event, time]) => (
            <div className="flex gap-3" key={event}>
              <div className="mt-1.5 size-2 rounded-full bg-foreground" />
              <div>
                <p className="text-sm">{event}</p>
                <p className="text-xs text-muted-foreground">{time}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
// Knowledge-source *capability* — which sources this agent may use at all
// (Agent.knowledgeSourceIds), distinct from the free-text "Knowledge" policy section
// inside Configuration (draft.instructions.Knowledge). References are stable source
// ids (lib/mock-data.ts's `sources[].id`), never names, so renaming a source's display
// name never breaks an agent's reference to it. Toggles write immediately — an on/off
// capability list, unlike the free-text sections, doesn't need explicit-save staging.
function KnowledgePanel({ agentId }: { agentId: string }) {
  const { data: draft } = useAgentDraft(agentId);
  const updateDraft = useUpdateAgentDraft(agentId);
  if (!draft) {
    return (
      <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">Loading…</div>
    );
  }
  const toggle = (sourceId: string) => {
    const next = draft.knowledgeSourceIds.includes(sourceId)
      ? draft.knowledgeSourceIds.filter((id) => id !== sourceId)
      : [...draft.knowledgeSourceIds, sourceId];
    updateDraft.mutate({ knowledgeSourceIds: next });
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Connected knowledge</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sources this agent is permitted to use during calls.
            </p>
          </div>
        </div>
        <div className="mt-5 divide-y">
          {sources.map((source) => {
            const enabled = draft.knowledgeSourceIds.includes(source.id);
            return (
              <div className="flex items-center gap-3 py-4" key={source.id}>
                <div className="grid size-9 place-items-center rounded-md bg-muted">
                  <FileText size={16} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{source.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {source.chunks} chunks · {source.updated}
                  </p>
                </div>
                <button
                  aria-label={`Toggle ${source.name}`}
                  onClick={() => toggle(source.id)}
                  className={cn(
                    'h-6 w-11 rounded-full p-0.5 transition-colors',
                    enabled ? 'bg-foreground' : 'bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'block size-5 rounded-full bg-background transition-transform',
                      enabled && 'translate-x-5',
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </Card>
      <Card className="p-5">
        <BrainCircuit size={20} />
        <h2 className="mt-3 font-medium">Retrieval policy</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {draft.instructions.Knowledge ||
            'No knowledge policy configured yet — set one in Configuration → Knowledge.'}
        </p>
      </Card>
    </div>
  );
}
// Tool *capability* — which tools this agent may reach for (Agent.toolIds), referenced
// by lib/mock-tools.ts's stable tool ids, distinct from the free-text "Tools" policy
// section inside Configuration. Same immediate-write reasoning as KnowledgePanel above.
function ToolsPanel({ agentId }: { agentId: string }) {
  const { data: draft } = useAgentDraft(agentId);
  const updateDraft = useUpdateAgentDraft(agentId);
  if (!draft) {
    return (
      <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">Loading…</div>
    );
  }
  const toggle = (toolId: string) => {
    const next = draft.toolIds.includes(toolId)
      ? draft.toolIds.filter((id) => id !== toolId)
      : [...draft.toolIds, toolId];
    updateDraft.mutate({ toolIds: next });
  };
  return (
    <Card className="p-5">
      <div>
        <h2 className="font-medium">Agent tools</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant focused abilities this agent may reach for.
        </p>
      </div>
      <div className="mt-5 divide-y">
        {tools.map((tool) => {
          const enabled = draft.toolIds.includes(tool.id);
          return (
            <div className="flex items-center gap-4 py-4" key={tool.id}>
              <div className="grid size-9 place-items-center rounded-md bg-muted">
                <Wrench size={16} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{tool.name}</p>
                <p className="text-xs text-muted-foreground">{tool.description}</p>
              </div>
              <button
                aria-label={`Toggle ${tool.name}`}
                onClick={() => toggle(tool.id)}
                className={cn(
                  'h-6 w-11 rounded-full p-0.5 transition-colors',
                  enabled ? 'bg-foreground' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'block size-5 rounded-full bg-background transition-transform',
                    enabled && 'translate-x-5',
                  )}
                />
              </button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
// Real canonical version history (AgentRepository.listVersions), not a fixture — see
// agent-model-implementation-plan.md Phase 3B requirement 6. Editing, publishing, and
// rollback all stay on Prompt Studio (the one canonical editing surface); this panel is
// a read-only durable record, linking there for anything that mutates the draft.
function VersionsPanel({
  agentId,
  onOpenPromptStudio,
}: {
  agentId: string;
  onOpenPromptStudio: () => void;
}) {
  const { data: draft } = useAgentDraft(agentId);
  const { data: versions = [] } = useAgentVersions(agentId);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
        <div>
          <h2 className="font-medium">Agent versions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A durable record of published agent behavior. Edit, publish, and roll back from Prompt
            Studio.
          </p>
        </div>
        <Button variant="outline" onClick={onOpenPromptStudio}>
          Open Prompt Studio
        </Button>
      </div>
      <div className="divide-y">
        {draft && (
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-medium">Draft</span>
              <Badge variant="warning">Not published</Badge>
              <span className="flex-1 text-sm text-muted-foreground">
                The currently editable configuration.
              </span>
              <Button variant="outline" onClick={() => toggleExpand('draft')}>
                {expanded.has('draft') ? 'Hide' : 'View'}
              </Button>
            </div>
            {expanded.has('draft') && <VersionSnapshot config={draft} />}
          </div>
        )}
        {versions.map((version) => (
          <div className="p-5" key={version.versionId}>
            <div className="flex flex-wrap items-center gap-4">
              <span className="font-medium">v{version.versionNumber}</span>
              <Badge variant="success">Published</Badge>
              {version.legacyLabel && (
                <span className="text-xs text-muted-foreground">legacy {version.legacyLabel}</span>
              )}
              <span className="flex-1 text-sm text-muted-foreground">
                {version.voice ? `${version.voice} voice` : 'No voice set'}
              </span>
              <Button variant="outline" onClick={() => toggleExpand(version.versionId)}>
                {expanded.has(version.versionId) ? 'Hide' : 'View'}
              </Button>
            </div>
            {expanded.has(version.versionId) && <VersionSnapshot config={version} />}
          </div>
        ))}
        {versions.length === 0 && (
          <div className="p-5 text-sm text-muted-foreground">
            No published versions yet — publish from Prompt Studio to create the first one.
          </div>
        )}
      </div>
    </Card>
  );
}
function VersionSnapshot({ config }: { config: AgentVersionConfig }) {
  return (
    <div className="mt-4 grid gap-3 rounded-md bg-muted/40 p-4 text-sm sm:grid-cols-2">
      {(['Identity', 'Personality', 'Guardrails', 'Output Schema'] as const).map((section) => (
        <div key={section}>
          <p className="text-xs font-medium text-muted-foreground">{section}</p>
          <p className="mt-1 line-clamp-3 text-sm">{config.instructions[section] || '—'}</p>
        </div>
      ))}
    </div>
  );
}
function AnalyticsPanel() {
  const bars = [42, 64, 55, 78, 66, 88, 73];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <h2 className="font-medium">Call success</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Qualified or scheduled outcomes over 7 days.
        </p>
        <div className="mt-8 flex h-52 items-end gap-3">
          {bars.map((value, index) => (
            <div className="flex flex-1 flex-col items-center gap-2" key={index}>
              <div
                className="w-full rounded-t bg-foreground"
                style={{ height: `${value * 1.7}px` }}
              />
              <span className="text-xs text-muted-foreground">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}
              </span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-medium">Top outcomes</h2>
        <div className="mt-5 space-y-5">
          {[
            ['Qualified lead', '51%'],
            ['Demo scheduled', '28%'],
            ['Transferred', '12%'],
            ['No match', '9%'],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="flex justify-between text-sm">
                <span>{label}</span>
                <span className="text-muted-foreground">{value}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-foreground" style={{ width: value }} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
