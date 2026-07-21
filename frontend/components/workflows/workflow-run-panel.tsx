'use client';
import { ArrowRight, Check, CircleDot, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { formatValue } from '@/lib/workflow-context';
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
  const currentContext = revealed.length ? revealed[revealed.length - 1].contextSnapshot : null;

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
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">Watch the path light up and see how state flows between nodes.</p>
          </div>
        </div>
      ) : (
        <div className="divide-y">
          <ol className="space-y-4 p-5">
            {revealed.map((step, index) => {
              const active = running && index === activeIndex;
              return (
                <li className="flex gap-3" key={step.nodeId}>
                  <CircleDot size={15} className={cn('mt-0.5 shrink-0', active ? 'text-emerald-500' : 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.detail}</p>

                    {step.conditionEvals && (
                      <div className="mt-2 space-y-1">
                        {step.conditionEvals.map((evaluation) => (
                          <div className="flex items-center gap-1.5 text-xs" key={evaluation.expression + evaluation.branch}>
                            {evaluation.result ? (
                              <Check size={13} className="text-emerald-500" />
                            ) : (
                              <X size={13} className="text-muted-foreground" />
                            )}
                            <span className={cn('font-mono', !evaluation.result && 'text-muted-foreground line-through')}>{evaluation.expression}</span>
                            {evaluation.branch && <span className="text-muted-foreground">→ {evaluation.branch}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {step.io && (
                      <div className="mt-2 rounded-md bg-muted p-2 text-xs">
                        <div className="flex flex-wrap items-center gap-1 font-mono">
                          <span className="text-muted-foreground">
                            {Object.entries(step.io.inputs).map(([k, val]) => `${k}=${formatValue(val)}`).join(', ') || '(no inputs)'}
                          </span>
                          <ArrowRight size={12} className="text-muted-foreground" />
                          <span>{Object.entries(step.io.outputs).map(([k, val]) => `${k}=${formatValue(val)}`).join(', ') || '(no outputs)'}</span>
                        </div>
                      </div>
                    )}

                    {step.variablesSet && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {Object.entries(step.variablesSet).map(([key, val]) => (
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-400" key={key}>
                            {key} = {formatValue(val)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {currentContext && (
            <div className="space-y-4 p-5">
              <StateBlock title="Variables" entries={currentContext.variables} />
              <StateBlock title="Session" entries={currentContext.session} />
              <p className="text-xs text-muted-foreground">{currentContext.conversation.length} conversation turns</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function StateBlock({ title, entries }: { title: string; entries: Record<string, string | number | boolean> }) {
  const rows = Object.entries(entries);
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <dl className="space-y-1 rounded-md bg-muted p-3 text-xs">
        {rows.map(([key, value]) => (
          <div className="flex justify-between gap-4" key={key}>
            <dt className="font-mono text-muted-foreground">{key}</dt>
            <dd className="font-mono">{formatValue(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
