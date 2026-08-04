'use client';
// The Agent-selection launcher for Prompt Studio — see
// documentation/agent-model-implementation-plan.md Phase 3B, §11 risk 1. This route
// must never silently pick an implicit "first" Agent or a hardcoded one; it holds only
// the *selection*, never any prompt/instructions state — AgentPromptStudio itself is
// the single source of truth for editing, and it only ever runs with an explicit
// agentId once one has been chosen here.
import { useState } from 'react';
import { ArrowLeft, Bot } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { AgentPromptStudio } from '@/components/agent-prompt-studio';
import { useAgents } from '@/hooks/use-agent-data';

export default function PromptStudio() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const { data: agents = [], isLoading } = useAgents();

  if (selectedAgentId) {
    const agent = agents.find((item) => item.agentId === selectedAgentId);
    return (
      <>
        <PageHeader
          title={agent ? `Prompt Studio — ${agent.name}` : 'Prompt Studio'}
          description="Create reliable conversation behavior with structured prompt controls."
          actions={
            <Button variant="outline" onClick={() => setSelectedAgentId(null)}>
              <ArrowLeft size={16} className="mr-2" />
              Choose a different agent
            </Button>
          }
        />
        <AgentPromptStudio agentId={selectedAgentId} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Prompt Studio"
        description="Choose an agent to edit its structured prompt configuration."
      />
      <Card>
        <div className="divide-y">
          {isLoading && <p className="p-5 text-sm text-muted-foreground">Loading agents…</p>}
          {!isLoading && agents.length === 0 && (
            <p className="p-5 text-sm text-muted-foreground">
              No agents yet. Create one from the Agents page first.
            </p>
          )}
          {agents.map((agent) => (
            <button
              key={agent.agentId}
              onClick={() => setSelectedAgentId(agent.agentId)}
              className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/50"
            >
              <div className="grid size-9 place-items-center rounded-md bg-muted">
                <Bot size={16} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{agent.name}</p>
                <p className="text-xs text-muted-foreground">Open its Prompt Studio draft</p>
              </div>
              <Badge variant={agent.status === 'Active' ? 'success' : 'neutral'}>
                {agent.status}
              </Badge>
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}
