'use client';
import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { WorkflowFilters } from '@/components/workflows/workflow-filters';
import { WorkflowTable } from '@/components/workflows/workflow-table';
import { useWorkflows } from '@/hooks/use-platform-data';
import { useWorkflowsStore } from '@/stores/workflows-store';

export default function WorkflowsPage() {
  const { data = [] } = useWorkflows();
  const filters = useWorkflowsStore((state) => state.filters);
  const workflows = useMemo(
    () =>
      data.filter((workflow) => {
        const q = filters.query.toLowerCase();
        const searchable = `${workflow.name} ${workflow.description}`.toLowerCase();
        return (!q || searchable.includes(q)) && (!filters.status || workflow.status === filters.status);
      }),
    [data, filters],
  );
  const stats = useMemo(
    () => [
      ['Total workflows', data.length.toString()],
      ['Live', data.filter((workflow) => workflow.status === 'Live').length.toString()],
      ['Runs this month', data.reduce((sum, workflow) => sum + workflow.runsThisMonth, 0).toLocaleString()],
      [
        'Avg. success',
        (() => {
          const live = data.filter((workflow) => workflow.runsThisMonth > 0);
          if (live.length === 0) return '—';
          return `${(live.reduce((sum, workflow) => sum + workflow.successRate, 0) / live.length).toFixed(1)}%`;
        })(),
      ],
    ],
    [data],
  );
  return (
    <>
      <PageHeader
        title="Workflows"
        description="Orchestrate how agents, tools, and knowledge work together on every call."
        actions={
          <Button>
            <Plus size={16} className="mr-2" />
            Create workflow
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <Card className="p-5" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <div className="mt-8">
        <div className="mb-3">
          <h2 className="font-medium">Orchestration flows</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {workflows.length} {workflows.length === 1 ? 'workflow' : 'workflows'} matching the current view.
          </p>
        </div>
        <div className="rounded-lg border bg-card">
          <WorkflowFilters />
          <WorkflowTable workflows={workflows} />
        </div>
      </div>
    </>
  );
}
