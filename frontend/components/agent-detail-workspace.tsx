'use client';
import { useEffect, useState } from 'react';
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
import { useAgentBuilderStore } from '@/stores/agent-builder-store';
import { useAgents } from '@/hooks/use-platform-data';
import type { Agent } from '@/lib/mock-data';
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
  const { data: agents, isLoading } = useAgents();
  const agent = agents?.find((item) => item.id === agentId);
  const hasUnsavedChanges = useAgentBuilderStore(agentId, (state) => state.hasUnsavedChanges());
  const config = useAgentBuilderStore(agentId, (state) => state.config);
  const save = useAgentBuilderStore(agentId, (state) => state.save);
  const discard = useAgentBuilderStore(agentId, (state) => state.discard);
  const hasErrors = validateAgentConfig(config).some((item) => item.severity === 'error');
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
  if (isLoading)
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
                {agent.purpose} · {agent.voice} voice
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
      {tab === 'Configuration' && (
        <>
          <AgentValidationSummary agentId={agentId} />
          <StructuredEditor sections={configSections} agentId={agentId} />
        </>
      )}{' '}
      {tab === 'Prompt Studio' && <AgentPromptStudio />} {tab === 'Knowledge' && <KnowledgePanel />}{' '}
      {tab === 'Tools' && <ToolsPanel />}{' '}
      {tab === 'Testing' && <AgentTestingPanel agentId={agentId} />}{' '}
      {tab === 'Versions' && <VersionsPanel />} {tab === 'Analytics' && <AnalyticsPanel />}
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
            {[
              [agent.calls.toLocaleString(), 'Calls this month'],
              [agent.successRate ? `${agent.successRate}%` : '—', 'Success rate'],
              ['4m 18s', 'Avg. duration'],
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
function KnowledgePanel() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">Connected knowledge</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sources available to Avery during calls.
            </p>
          </div>
          <Button variant="outline">Manage sources</Button>
        </div>
        <div className="mt-5 divide-y">
          {[
            ['Customer onboarding guide.pdf', '84 chunks · synced today'],
            ['Pricing FAQ.docx', '42 chunks · synced Jul 9'],
            ['Support knowledge base', '312 chunks · live sync'],
          ].map(([name, meta]) => (
            <div className="flex items-center gap-3 py-4" key={name}>
              <div className="grid size-9 place-items-center rounded-md bg-muted">
                <FileText size={16} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-xs text-muted-foreground">{meta}</p>
              </div>
              <Badge variant="success">Available</Badge>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-5">
        <BrainCircuit size={20} />
        <h2 className="mt-3 font-medium">Retrieval policy</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Avery cites grounded workspace knowledge and asks a clarifying question when context is
          insufficient.
        </p>
      </Card>
    </div>
  );
}
function ToolsPanel() {
  const [tools, setTools] = useState<Array<[string, boolean]>>([
    ['Calendar availability', true],
    ['CRM lookup', true],
    ['Create lead', true],
    ['Send follow-up', false],
  ]);
  return (
    <Card className="p-5">
      <div>
        <h2 className="font-medium">Agent tools</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant focused abilities and define when Avery can use them.
        </p>
      </div>
      <div className="mt-5 divide-y">
        {tools.map(([name, enabled], index) => (
          <div className="flex items-center gap-4 py-4" key={name}>
            <div className="grid size-9 place-items-center rounded-md bg-muted">
              <Wrench size={16} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">
                Available after the relevant caller intent is confirmed.
              </p>
            </div>
            <button
              aria-label={`Toggle ${name}`}
              onClick={() =>
                setTools((items) =>
                  items.map((tool, i) => (i === index ? [tool[0], !tool[1]] : tool)),
                )
              }
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
        ))}
      </div>
    </Card>
  );
}
function VersionsPanel() {
  return (
    <Card className="overflow-hidden">
      <div className="border-b p-5">
        <h2 className="font-medium">Agent versions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A durable record of published agent behavior.
        </p>
      </div>
      <div className="divide-y">
        {[
          ['v14', 'Current draft', 'Edited just now', 'Not published'],
          ['v13', 'Published', 'Jul 14, 2026', 'Discovery flow refined'],
          ['v12', 'Published', 'Jul 8, 2026', 'Initial baseline'],
        ].map(([version, status, time, detail]) => (
          <div className="flex flex-wrap items-center gap-4 p-5" key={version}>
            <span className="font-medium">{version}</span>
            <Badge variant={status === 'Published' ? 'success' : 'warning'}>{status}</Badge>
            <span className="flex-1 text-sm text-muted-foreground">{detail}</span>
            <span className="text-xs text-muted-foreground">{time}</span>
            <Button variant="outline">View</Button>
          </div>
        ))}
      </div>
    </Card>
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
