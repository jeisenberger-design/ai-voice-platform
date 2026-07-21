'use client';
import { BookOpen, Bot, CircleCheck, GitFork, MessageSquare, PhoneIncoming, ArrowRightLeft, Wrench } from 'lucide-react';
import type { ComponentType } from 'react';
import type { Workflow, WorkflowNodeKind } from '@/lib/mock-workflows';
import type { NodeRunStatus } from '@/lib/workflow-execution';
import { cn } from '@/lib/utils';

const NODE_W = 190;
const NODE_H = 64;
const PAD = 24;

const kindIcon: Record<WorkflowNodeKind, ComponentType<{ size?: number }>> = {
  trigger: PhoneIncoming,
  agent: Bot,
  tool: Wrench,
  knowledge: BookOpen,
  decision: GitFork,
  transfer: ArrowRightLeft,
  message: MessageSquare,
  end: CircleCheck,
};
const kindLabel: Record<WorkflowNodeKind, string> = {
  trigger: 'Trigger',
  agent: 'Agent',
  tool: 'Tool',
  knowledge: 'Knowledge',
  decision: 'Decision',
  transfer: 'Transfer',
  message: 'Message',
  end: 'End',
};

export function WorkflowGraph({
  workflow,
  statuses,
  activePath,
}: {
  workflow: Workflow;
  statuses: Record<string, NodeRunStatus> | null;
  activePath: string[] | null;
}) {
  const width = Math.max(...workflow.nodes.map((n) => n.position.x + NODE_W)) + PAD;
  const height = Math.max(...workflow.nodes.map((n) => n.position.y + NODE_H)) + PAD;
  const nodeById = Object.fromEntries(workflow.nodes.map((n) => [n.id, n]));

  const isTraversed = (source: string, target: string) => {
    if (!activePath || !statuses) return false;
    const si = activePath.indexOf(source);
    const ti = activePath.indexOf(target);
    if (si === -1 || ti !== si + 1) return false;
    return statuses[target] === 'active' || statuses[target] === 'completed';
  };

  return (
    <div className="overflow-auto rounded-lg border bg-muted/20 p-2">
      <div className="relative" style={{ width, height }}>
        <svg width={width} height={height} className="absolute inset-0">
          <defs>
            <marker id="wf-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="fill-border" />
            </marker>
            <marker id="wf-arrow-active" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="fill-emerald-500" />
            </marker>
          </defs>
          {workflow.edges.map((edge) => {
            const s = nodeById[edge.source];
            const t = nodeById[edge.target];
            if (!s || !t) return null;
            const x1 = s.position.x + NODE_W / 2;
            const y1 = s.position.y + NODE_H;
            const x2 = t.position.x + NODE_W / 2;
            const y2 = t.position.y;
            const traversed = isTraversed(edge.source, edge.target);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            return (
              <g key={edge.id}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={cn('stroke-2', traversed ? 'stroke-emerald-500' : 'stroke-border')}
                  markerEnd={traversed ? 'url(#wf-arrow-active)' : 'url(#wf-arrow)'}
                />
                {edge.label && (
                  <g>
                    <rect x={midX - 30} y={midY - 10} width={60} height={20} rx={6} className="fill-background stroke-border" />
                    <text x={midX} y={midY + 4} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
        {workflow.nodes.map((node) => {
          const Icon = kindIcon[node.kind];
          const status = statuses?.[node.id];
          return (
            <div
              key={node.id}
              className={cn(
                'absolute flex flex-col justify-center rounded-lg border bg-card px-3 py-2 shadow-sm transition-all',
                status === 'active' && 'border-emerald-500 ring-2 ring-emerald-500/40',
                status === 'completed' && 'border-emerald-500/60',
                status === 'skipped' && 'opacity-40',
                status === 'pending' && 'opacity-70',
              )}
              style={{ left: node.position.x, top: node.position.y, width: NODE_W, height: NODE_H }}
            >
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                <Icon size={12} />
                {kindLabel[node.kind]}
              </div>
              <p className="mt-0.5 truncate text-sm font-medium">{node.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
