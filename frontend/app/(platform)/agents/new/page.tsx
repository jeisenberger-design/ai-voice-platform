'use client';
import { FormEvent, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { PageHeader } from '@/components/page-header';
import { useCreateAgent } from '@/hooks/use-agent-data';

export default function NewAgentPage() {
  const [name, setName] = useState('');
  const createAgent = useCreateAgent();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const agent = await createAgent.mutateAsync({ name: trimmed });
    // Full navigation, matching the existing pattern elsewhere in this workspace
    // (agent-detail-workspace.tsx's back()) rather than introducing next/navigation.
    window.location.assign(`/agents/${agent.agentId}`);
  };

  return (
    <>
      <PageHeader
        title="Create agent"
        description="Configure a new AI voice agent for your workspace."
      />
      <Card className="mx-auto max-w-md p-6">
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">
            Agent name
            <input
              className="input mt-2"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Avery · Sales"
              autoFocus
              required
            />
          </label>
          <p className="text-sm text-muted-foreground">
            Creates a new agent with an empty, editable draft. Nothing is published until you
            explicitly publish it.
          </p>
          <Button type="submit" disabled={!name.trim() || createAgent.isPending}>
            {createAgent.isPending ? 'Creating…' : 'Create agent'}
          </Button>
        </form>
      </Card>
    </>
  );
}
