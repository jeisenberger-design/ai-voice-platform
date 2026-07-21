'use client';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Braces,
  CircleCheck,
  CornerDownRight,
  Flag,
  GitFork,
  MessageSquare,
  Play,
  RotateCcw,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { Badge, Button, Card } from '@/components/ui';
import { formatValue, type WorkflowValue } from '@/lib/workflow-context';
import type { ExecutionEvent, ExecutionEventType } from '@/lib/workflow-events';
import { projectConversation, projectStateTransitions, projectToolCalls } from '@/lib/workflow-projections';
import type { WorkflowRun } from '@/lib/workflow-execution';
import { cn } from '@/lib/utils';

type TabKey = 'timeline' | 'state' | 'tools' | 'conversation';

const formatTime = (t: number) => (t < 1000 ? `${t}ms` : `${(t / 1000).toFixed(2)}s`);
const pairs = (entries: Record<string, WorkflowValue>) =>
  Object.entries(entries)
    .map(([key, value]) => `${key}=${formatValue(value)}`)
    .join(', ');

const eventIcon: Record<ExecutionEventType, ComponentType<{ size?: number; className?: string }>> = {
  'run.started': Flag,
  'run.completed': CircleCheck,
  'node.entered': CornerDownRight,
  'node.exited': CornerDownRight,
  'tool.invoked': Wrench,
  'tool.returned': Wrench,
  'condition.evaluated': GitFork,
  'state.changed': Braces,
  'conversation.turn': MessageSquare,
  'edge.traversed': ArrowRight,
};

export function WorkflowRunPanel({
  run,
  activeIndex,
  running,
  onRun,
  onReset,
}: {
  run: WorkflowRun | null;
  activeIndex: number;
  running: boolean;
  onRun: () => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('timeline');

  const revealed = useMemo<ExecutionEvent[]>(() => {
    if (!run) return [];
    const revealedNodes = new Set(run.path.slice(0, activeIndex + 1));
    const finished = activeIndex >= run.path.length;
    return run.events.filter((event) => {
      if (event.type === 'run.started') return true;
      if (event.type === 'run.completed') return finished;
      if (event.nodeId) return revealedNodes.has(event.nodeId);
      return true;
    });
  }, [run, activeIndex]);

  const timeline = useMemo(() => revealed.filter((event) => event.type !== 'node.exited'), [revealed]);
  const transitions = useMemo(() => projectStateTransitions(revealed), [revealed]);
  const toolCalls = useMemo(() => projectToolCalls(revealed), [revealed]);
  const conversation = useMemo(() => projectConversation(revealed), [revealed]);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: 'timeline', label: 'Timeline', count: timeline.length },
    { key: 'state', label: 'State', count: transitions.length },
    { key: 'tools', label: 'Tool Calls', count: toolCalls.length },
    { key: 'conversation', label: 'Conversation', count: conversation.length },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b p-5">
        <div>
          <h2 className="font-medium">Test run</h2>
          <p className="mt-1 text-sm text-muted-foreground">Observe execution as an event stream. No calls are placed.</p>
        </div>
        <Badge variant={running ? 'success' : 'neutral'}>{running ? 'Running' : 'Mock'}</Badge>
      </div>

      <div className="flex gap-2 border-b p-4">
        <Button onClick={onRun} disabled={running}>
          <Play size={16} className="mr-2" />
          {run ? 'Run again' : 'Run test'}
        </Button>
        {run && (
          <Button variant="outline" onClick={onReset} disabled={running}>
            <RotateCcw size={16} className="mr-2" />
            Reset
          </Button>
        )}
      </div>

      {!run ? (
        <div className="grid min-h-40 place-items-center p-6 text-center">
          <div>
            <div className="mx-auto grid size-10 place-items-center rounded-full bg-muted">
              <Sparkles size={18} />
            </div>
            <p className="mt-3 text-sm font-medium">Run a simulated execution</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">Every view below is a projection of one immutable event stream.</p>
          </div>
        </div>
      ) : (
        <>
          <nav className="flex gap-1 overflow-x-auto border-b px-2">
            {tabs.map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm text-muted-foreground transition-colors',
                  tab === key ? 'border-foreground font-medium text-foreground' : 'border-transparent hover:text-foreground',
                )}
              >
                {label}
                <span className="rounded-full bg-muted px-1.5 text-xs">{count}</span>
              </button>
            ))}
          </nav>

          <div className="p-5">
            {tab === 'timeline' && <TimelineView events={timeline} activeNodeId={run.path[activeIndex]} running={running} />}
            {tab === 'state' && <StateView transitions={transitions} />}
            {tab === 'tools' && <ToolCallsView calls={toolCalls} />}
            {tab === 'conversation' && <ConversationView turns={conversation} />}
          </div>
        </>
      )}
    </Card>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function TimelineView({ events, activeNodeId, running }: { events: ExecutionEvent[]; activeNodeId?: string; running: boolean }) {
  if (events.length === 0) return <EmptyHint text="No events yet." />;
  return (
    <ol className="space-y-2.5">
      {events.map((event) => {
        const Icon = eventIcon[event.type];
        const isNode = event.type === 'node.entered';
        const active = running && isNode && event.nodeId === activeNodeId;
        return (
          <li key={event.eventId} className={cn('flex gap-3 text-sm', !isNode && 'pl-4')}>
            <span className="w-12 shrink-0 pt-0.5 text-right font-mono text-xs text-muted-foreground">{formatTime(event.t)}</span>
            <Icon size={14} className={cn('mt-0.5 shrink-0', active ? 'text-emerald-500' : 'text-muted-foreground')} />
            <div className="min-w-0 flex-1">{renderEvent(event)}</div>
          </li>
        );
      })}
    </ol>
  );
}

function renderEvent(event: ExecutionEvent) {
  switch (event.type) {
    case 'run.started':
      return <span className="font-medium">Run started</span>;
    case 'run.completed':
      return (
        <span className="font-medium">
          Run completed{event.outcome ? <span className="text-muted-foreground"> · {event.outcome}</span> : null}
        </span>
      );
    case 'node.entered':
      return (
        <span>
          <span className="font-medium">{event.label}</span>
          <span className="ml-1.5 text-xs uppercase tracking-wide text-muted-foreground">{event.kind}</span>
        </span>
      );
    case 'tool.invoked':
      return (
        <span className="text-muted-foreground">
          Invoked <span className="font-mono text-foreground">{event.toolName}</span>
          {Object.keys(event.inputs).length > 0 && <span className="font-mono"> ({pairs(event.inputs)})</span>}
        </span>
      );
    case 'tool.returned':
      return (
        <span className="text-muted-foreground">
          <span className="font-mono text-foreground">{event.toolName}</span> returned <span className="font-mono">{pairs(event.outputs) || '—'}</span>
        </span>
      );
    case 'condition.evaluated':
      return (
        <span className={cn('font-mono text-xs', !event.result && 'text-muted-foreground line-through')}>
          {event.expression}
          {event.result && event.branch ? <span className="ml-1 no-underline">→ {event.branch}</span> : null}
        </span>
      );
    case 'state.changed':
      return (
        <span className="font-mono text-xs">
          <span className="text-muted-foreground">
            {event.scope}.{event.key}:
          </span>{' '}
          {formatValue(event.from)} → <span className="text-emerald-600 dark:text-emerald-400">{formatValue(event.to)}</span>
        </span>
      );
    case 'conversation.turn':
      return (
        <span>
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{event.speaker}</span> <span>{event.text}</span>
        </span>
      );
    case 'edge.traversed':
      return <span className="text-muted-foreground">→ {event.label ?? event.targetId}</span>;
    default:
      return null;
  }
}

function StateView({ transitions }: { transitions: ReturnType<typeof projectStateTransitions> }) {
  if (transitions.length === 0) return <EmptyHint text="No state changes yet." />;
  return (
    <ul className="space-y-2">
      {transitions.map((change) => (
        <li key={`${change.seq}`} className="flex items-baseline gap-3 text-sm">
          <span className="w-12 shrink-0 text-right font-mono text-xs text-muted-foreground">{formatTime(change.t)}</span>
          <span className="font-mono text-xs">
            <span className="text-muted-foreground">
              {change.scope}.{change.key}
            </span>{' '}
            {formatValue(change.from)} → <span className="text-emerald-600 dark:text-emerald-400">{formatValue(change.to)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function ToolCallsView({ calls }: { calls: ReturnType<typeof projectToolCalls> }) {
  if (calls.length === 0) return <EmptyHint text="No tool calls yet." />;
  return (
    <ul className="space-y-3">
      {calls.map((call, index) => (
        <li key={`${call.stepId}-${index}`} className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{call.toolName}</span>
            <span className="font-mono text-xs text-muted-foreground">{formatTime(call.t)}</span>
          </div>
          <div className="mt-2 space-y-1 font-mono text-xs">
            <div>
              <span className="text-muted-foreground">in </span>
              {pairs(call.inputs) || '—'}
            </div>
            <div>
              <span className="text-muted-foreground">out </span>
              {call.outputs ? pairs(call.outputs) || '—' : <span className="text-muted-foreground">pending…</span>}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ConversationView({ turns }: { turns: ReturnType<typeof projectConversation> }) {
  if (turns.length === 0) return <EmptyHint text="No conversation yet." />;
  return (
    <ul className="space-y-3">
      {turns.map((turn, index) => (
        <li key={index} className={cn('max-w-[85%]', turn.speaker === 'caller' && 'ml-auto')}>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{turn.speaker}</p>
          <div className={cn('rounded-lg px-3 py-2 text-sm', turn.speaker === 'caller' ? 'bg-foreground text-background' : 'bg-muted')}>{turn.text}</div>
        </li>
      ))}
    </ul>
  );
}
