'use client';
import { CircleDot, Play, RotateCcw, Sparkles } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import type { WorkflowRun } from '@/lib/workflow-execution';
import { cn } from '@/lib/utils';

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
  const revealed = run ? run.steps.slice(0, Math.min(activeIndex + 1, run.steps.length)) : [];
  const variables = revealed.reduce<Record<string, string>>((acc, step) => ({ ...acc, ...(step.variables ?? {}) }), {});
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b p-5">
        <div>
          <h2 className="font-medium">Test run</h2>
          <p className="mt-1 text-sm text-muted-foreground">Simulate execution across the graph. No calls are placed.</p>
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
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">Watch the path light up node by node and see the state it collects.</p>
          </div>
        </div>
      ) : (
        <div className="divide-y">
          <ol className="space-y-3 p-5">
            {revealed.map((step, index) => {
              const active = running && index === activeIndex;
              return (
                <li className="flex gap-3" key={step.nodeId}>
                  <CircleDot size={15} className={cn('mt-0.5 shrink-0', active ? 'text-emerald-500' : 'text-muted-foreground')} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {step.detail}
                      {step.branch ? ` → ${step.branch}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          {Object.keys(variables).length > 0 && (
            <div className="p-5">
              <p className="mb-2 text-sm font-medium">Collected state</p>
              <dl className="space-y-1 rounded-md bg-muted p-3 text-xs">
                {Object.entries(variables).map(([key, value]) => (
                  <div className="flex justify-between gap-4" key={key}>
                    <dt className="font-mono text-muted-foreground">{key}</dt>
                    <dd className="font-mono">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
