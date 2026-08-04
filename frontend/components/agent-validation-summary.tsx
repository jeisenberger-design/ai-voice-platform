'use client';
import { AlertTriangle, CheckCircle2, ChevronRight, ShieldCheck } from 'lucide-react';
import { Card, Badge } from '@/components/ui';
import { validateAgentConfig } from '@/lib/agent-validation';
import type { InstructionSection } from '@/lib/agent-model';

export function AgentValidationSummary({
  instructions,
}: {
  instructions: Record<InstructionSection, string>;
}) {
  const results = validateAgentConfig(instructions);
  const issues = results.filter((result) => result.severity !== 'pass');
  return (
    <Card className="mb-6 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-full bg-muted">
            <ShieldCheck size={18} />
          </div>
          <div>
            <p className="font-medium">Pre-publish checks</p>
            <p className="text-sm text-muted-foreground">
              {issues.length === 0
                ? 'All required configuration is ready for testing.'
                : `${issues.length} item${issues.length === 1 ? '' : 's'} need attention before publishing.`}
            </p>
          </div>
        </div>
        <Badge variant={issues.some((item) => item.severity === 'error') ? 'warning' : 'success'}>
          {issues.length === 0 ? 'Ready to test' : 'Needs attention'}
        </Badge>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {results.map((result) => (
          <div
            className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm"
            key={result.section}
          >
            {result.severity === 'pass' ? (
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle size={16} className="shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <div className="min-w-0 flex-1">
              <span className="font-medium">{result.title}</span>
              <span className="ml-1 text-muted-foreground">{result.detail}</span>
            </div>
            <ChevronRight size={15} className="text-muted-foreground" />
          </div>
        ))}
      </div>
    </Card>
  );
}
