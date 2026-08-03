'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Bot, Wrench } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { agents } from '@/lib/mock-data';
import { tools } from '@/lib/mock-tools';
import type { Workflow } from '@/lib/mock-workflows';
import {
  simulateWorkflowRun,
  type NodeRunStatus,
  type WorkflowRun,
} from '@/lib/workflow-execution';
import { WorkflowGraph } from '@/components/workflows/workflow-graph';
import { WorkflowRunPanel } from '@/components/workflows/workflow-run-panel';

const STEP_DELAY = 750;
const statusVariant = (status: Workflow['status']) =>
  status === 'Live' ? 'success' : status === 'Paused' ? 'warning' : 'neutral';

export function WorkflowDetail({ workflow }: { workflow: Workflow }) {
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runToken = useRef(0);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const startRun = async () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    runToken.current += 1;
    const token = runToken.current;
    setRunning(true);
    // The runtime boundary is async, so a reset (or a newer run) can land mid-flight.
    const next = await simulateWorkflowRun(workflow);
    if (runToken.current !== token) return;
    setRun(next);
    setActiveIndex(0);
    for (let i = 1; i < next.path.length; i += 1) {
      timers.current.push(setTimeout(() => setActiveIndex(i), i * STEP_DELAY));
    }
    timers.current.push(
      setTimeout(() => {
        setActiveIndex(next.path.length);
        setRunning(false);
      }, next.path.length * STEP_DELAY),
    );
  };

  const resetRun = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    runToken.current += 1;
    setRun(null);
    setActiveIndex(0);
    setRunning(false);
  };

  const statuses = useMemo<Record<string, NodeRunStatus> | null>(() => {
    if (!run) return null;
    return Object.fromEntries(
      workflow.nodes.map((node) => {
        const idx = run.path.indexOf(node.id);
        if (idx === -1) return [node.id, 'skipped'];
        if (idx < activeIndex) return [node.id, 'completed'];
        if (idx === activeIndex) return [node.id, 'active'];
        return [node.id, 'pending'];
      }),
    );
  }, [run, activeIndex, workflow.nodes]);

  const linkedAgents = agents.filter((agent) => workflow.agentIds.includes(agent.id));
  const linkedTools = tools.filter((tool) => workflow.toolIds.includes(tool.id));

  return (
    <>
      <header className="mb-6">
        <Link
          href="/workflows"
          className="mb-4 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Workflows
        </Link>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{workflow.name}</h1>
              <Badge variant={statusVariant(workflow.status)}>{workflow.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {workflow.trigger} · v{workflow.version}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline">Edit workflow</Button>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{workflow.description}</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card className="overflow-hidden">
            <div className="border-b p-5">
              <h2 className="font-medium">Execution graph</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                How this workflow orchestrates each call, step by step.
              </p>
            </div>
            <div className="p-4">
              <WorkflowGraph
                workflow={workflow}
                statuses={statuses}
                activePath={run?.path ?? null}
              />
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <WorkflowRunPanel
            run={run}
            activeIndex={activeIndex}
            running={running}
            onRun={startRun}
            onReset={resetRun}
          />

          <Card className="p-5">
            <h2 className="font-medium">Connections</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Resources this workflow orchestrates.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Agents</p>
                {linkedAgents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <div className="space-y-2">
                    {linkedAgents.map((agent) => (
                      <Link
                        href={`/agents/${agent.id}`}
                        className="flex items-center gap-2 text-sm hover:underline"
                        key={agent.id}
                      >
                        <Bot size={15} className="text-muted-foreground" />
                        {agent.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Tools</p>
                {linkedTools.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <div className="space-y-2">
                    {linkedTools.map((tool) => (
                      <Link
                        href={`/tools/${tool.id}`}
                        className="flex items-center gap-2 text-sm hover:underline"
                        key={tool.id}
                      >
                        <Wrench size={15} className="text-muted-foreground" />
                        {tool.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Knowledge
                </p>
                {workflow.knowledgeSources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None</p>
                ) : (
                  <div className="space-y-2">
                    {workflow.knowledgeSources.map((source) => (
                      <div className="flex items-center gap-2 text-sm" key={source}>
                        <BookOpen size={15} className="text-muted-foreground" />
                        {source}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="font-medium">Overview</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-2xl font-semibold">{workflow.runsThisMonth.toLocaleString()}</p>
                <p className="text-muted-foreground">Runs this month</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">
                  {workflow.runsThisMonth ? `${workflow.successRate}%` : '—'}
                </p>
                <p className="text-muted-foreground">Success rate</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{workflow.avgDuration}</p>
                <p className="text-muted-foreground">Avg. duration</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">{workflow.nodes.length}</p>
                <p className="text-muted-foreground">Steps</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Updated {workflow.updated}</p>
          </Card>
        </div>
      </div>
    </>
  );
}
