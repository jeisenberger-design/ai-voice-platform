'use client';
import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { ToolFilters } from '@/components/tools/tool-filters';
import { ToolTable } from '@/components/tools/tool-table';
import { useTools } from '@/hooks/use-platform-data';
import { useToolsStore } from '@/stores/tools-store';

export default function ToolsPage() {
  const { data = [] } = useTools();
  const filters = useToolsStore((state) => state.filters);
  const tools = useMemo(
    () =>
      data.filter((tool) => {
        const q = filters.query.toLowerCase();
        const searchable = `${tool.name} ${tool.description}`.toLowerCase();
        return (
          (!q || searchable.includes(q)) &&
          (!filters.category || tool.category === filters.category) &&
          (!filters.status || tool.status === filters.status)
        );
      }),
    [data, filters],
  );
  const stats = useMemo(
    () => [
      ['Total tools', data.length.toString()],
      ['Active', data.filter((tool) => tool.status === 'Active').length.toString()],
      ['Drafts', data.filter((tool) => tool.status === 'Draft').length.toString()],
      [
        'Calls this month',
        data.reduce((sum, tool) => sum + tool.callsThisMonth, 0).toLocaleString(),
      ],
    ],
    [data],
  );
  return (
    <>
      <PageHeader
        title="Tools"
        description="Define the actions your agents can take during a conversation."
        actions={
          <Button>
            <Plus size={16} className="mr-2" />
            Create tool
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
          <h2 className="font-medium">Tool registry</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {tools.length} {tools.length === 1 ? 'tool' : 'tools'} matching the current view.
          </p>
        </div>
        <div className="rounded-lg border bg-card">
          <ToolFilters />
          <ToolTable tools={tools} />
        </div>
      </div>
    </>
  );
}
