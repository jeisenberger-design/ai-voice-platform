'use client';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Badge, Card } from '@/components/ui';
import type { Tool } from '@/lib/mock-tools';

const columns = ['Tool', 'Category', 'Type', 'Auth', 'Used by', 'Calls', 'Success', 'Status', ''];

export function ToolTable({ tools }: { tools: Tool[] }) {
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
            {tools.map((tool) => (
              <tr className="border-b last:border-0 hover:bg-muted/30" key={tool.id}>
                <td className="px-5 py-4">
                  <Link href={`/tools/${tool.id}`} className="font-medium hover:underline">
                    {tool.name}
                  </Link>
                  <p className="mt-0.5 max-w-sm truncate text-xs text-muted-foreground">{tool.description}</p>
                </td>
                <td className="px-5 py-4 text-muted-foreground">{tool.category}</td>
                <td className="px-5 py-4 text-muted-foreground">{tool.kind}</td>
                <td className="px-5 py-4">
                  {tool.authType === 'None' ? (
                    <span className="text-muted-foreground">None</span>
                  ) : (
                    <Badge variant="warning">{tool.authType}</Badge>
                  )}
                </td>
                <td className="px-5 py-4 text-muted-foreground">
                  {tool.usedByAgents.length} {tool.usedByAgents.length === 1 ? 'agent' : 'agents'}
                </td>
                <td className="px-5 py-4">{tool.callsThisMonth.toLocaleString()}</td>
                <td className="px-5 py-4">{tool.callsThisMonth ? `${tool.successRate}%` : '—'}</td>
                <td className="px-5 py-4">
                  <Badge variant={tool.status === 'Active' ? 'success' : 'neutral'}>{tool.status}</Badge>
                </td>
                <td className="px-5 py-4">
                  <Link href={`/tools/${tool.id}`} aria-label={`Open ${tool.name}`}>
                    <ArrowUpRight size={17} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tools.length === 0 && (
        <div className="p-12 text-center text-sm text-muted-foreground">No tools match the current filters.</div>
      )}
    </Card>
  );
}
