'use client';
import { useState } from 'react';
import {
  Check,
  Clock3,
  Copy,
  GitCompareArrows,
  History,
  RotateCcw,
  Send,
  SplitSquareHorizontal,
} from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { cn } from '@/lib/utils';
const sections = [
  'Identity',
  'Greeting',
  'Conversation Rules',
  'Knowledge Instructions',
  'Emergency Rules',
  'Transfer Rules',
  'Data Collection',
  'Output Schema',
];
const versions = [
  {
    id: 14,
    label: 'v14',
    status: 'Draft',
    time: 'Edited just now',
    note: 'Added guardrail for sensitive information.',
  },
  {
    id: 13,
    label: 'v13',
    status: 'Published',
    time: 'Jul 14, 2026',
    note: 'Refined discovery and qualification flow.',
  },
  {
    id: 12,
    label: 'v12',
    status: 'Published',
    time: 'Jul 8, 2026',
    note: 'Initial sales qualification baseline.',
  },
];
export function AgentPromptStudio() {
  const [active, setActive] = useState(sections[0]),
    [selected, setSelected] = useState(14),
    [compare, setCompare] = useState(false),
    [published, setPublished] = useState(false);
  const version = versions.find((item) => item.id === selected)!;
  return (
    <div className="grid gap-6 xl:grid-cols-[220px_1fr_260px]">
      <aside className="rounded-lg border bg-card p-3">
        <div className="mb-3 flex items-center justify-between px-2">
          <span className="text-sm font-medium">Prompt sections</span>
          <Button variant="ghost" className="h-7 px-1" aria-label="Duplicate prompt">
            <Copy size={15} />
          </Button>
        </div>
        {sections.map((section, index) => (
          <button
            onClick={() => setActive(section)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted',
              active === section && 'bg-muted text-foreground font-medium',
            )}
            key={section}
          >
            <span className="text-xs">{String(index + 1).padStart(2, '0')}</span>
            {section}
          </button>
        ))}
      </aside>
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-medium">{active}</h2>
                <Badge variant={published ? 'success' : 'warning'}>
                  {published ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Structured behavior block. Changes are tracked as a versioned draft.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCompare(!compare)}>
                <GitCompareArrows size={16} className="mr-2" />
                {compare ? 'Close compare' : 'Compare'}
              </Button>
              <Button onClick={() => setPublished(true)}>
                <Send size={16} className="mr-2" />
                Publish
              </Button>
            </div>
          </div>
          {compare ? (
            <div className="grid divide-x md:grid-cols-2">
              <PromptBlock title="v13 · Published" muted />
              <PromptBlock title="v14 · Draft" />
            </div>
          ) : (
            <PromptBlock title={`${version.label} · ${version.status}`} />
          )}
        </Card>
        {published && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700 dark:text-emerald-400">
            <Check size={16} />
            Version 14 published to the mock agent configuration.
          </div>
        )}
      </div>
      <aside className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex items-center gap-2">
            <History size={16} />
            <h2 className="font-medium">Version history</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Restore or compare previous behavior.
          </p>
        </div>
        <div className="divide-y">
          {versions.map((item) => (
            <button
              onClick={() => {
                setSelected(item.id);
                setPublished(item.status === 'Published');
              }}
              className={cn(
                'w-full p-4 text-left hover:bg-muted/50',
                selected === item.id && 'bg-muted/50',
              )}
              key={item.id}
            >
              <div className="flex justify-between">
                <span className="font-medium text-sm">{item.label}</span>
                <Badge variant={item.status === 'Published' ? 'success' : 'warning'}>
                  {item.status}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{item.note}</p>
              <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Clock3 size={12} />
                {item.time}
              </p>
            </button>
          ))}
        </div>
        <div className="p-3">
          <Button variant="outline" className="w-full" onClick={() => setPublished(false)}>
            <RotateCcw size={15} className="mr-2" />
            Rollback to selected
          </Button>
        </div>
      </aside>
    </div>
  );
}
function PromptBlock({ title, muted = false }: { title: string; muted?: boolean }) {
  return (
    <div className={cn('p-5', muted && 'bg-muted/20')}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        <SplitSquareHorizontal size={16} className="text-muted-foreground" />
      </div>
      <label className="block text-sm font-medium">
        Behavior contract
        <textarea
          className="input mt-2 min-h-48 resize-y"
          defaultValue={
            muted
              ? 'Ask relevant discovery questions, confirm company size, and then offer a calendar slot.'
              : 'Ask one discovery question at a time. Confirm the caller’s role, team size, and use case before offering a next step. Never make product guarantees.'
          }
          readOnly={muted}
        />
      </label>
      <div className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
        This section is composed with the other structured blocks at publish time.
      </div>
    </div>
  );
}
