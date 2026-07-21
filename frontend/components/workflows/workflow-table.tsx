'use client';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import type { Workflow } from '@/lib/mock-workflows';

const columns = ['Workflow', 'Trigger', 'Steps', 'Connections', 'Runs', 'Success', 'Status', ''];
const statusVariant = (status: Workflow['status']) => (status === 'Live' ? 'success' : status === 'Paused' ? 'warning' : 'neutral');

export function WorkflowTable({ workflows }: { workflows: Workflow[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              {columns.map((label) => (
                <th className="px-5 py-3 font-medium" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workflows.map((workflow) => {
              return (
                <tr className="border-b last:border-0 hover:bg-muted/30" key={workflow.id}>
                  <td className="px-5 py-4">
                    <Link href={`/workflows/${workflow.id}`} className="font-medium hover:underline">
                      {workflow.name}
                    </Link>
                    <p className="mt-0.5 max-w-sm truncate text-xs text-muted-foreground">{workflow.description}</p>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{workflow.trigger}</td>
                  <td className="px-5 py-4">{workflow.nodes.length}</td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {workflow.agentIds.length}A · {workflow.toolIds.length}T · {workflow.knowledgeSources.length}K
                  </td>
                  <td className="px-5 py-4">{workflow.runsThisMonth.toLocaleString()}</td>
                  <td className="px-5 py-4">{workflow.runsThisMonth ? `${workflow.successRate}%` : '—'}</td>
                  <td className="px-5 py-4">
                    <Badge variant={statusVariant(workflow.status)}>{workflow.status}</Badge>
                  </td>
                  <td className="px-5 py-4">
                    <Link href={`/workflows/${workflow.id}`} aria-label={`Open ${workflow.name}`}>
                      <ArrowUpRight size={17} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {workflows.length === 0 && (
        <div className="p-12 text-center text-sm text-muted-foreground">No workflows match the current filters.</div>
      )}
    </Card>
  );
}
