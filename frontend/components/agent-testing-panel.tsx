'use client';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { Construction, Mic, Phone, PhoneOff, Play, Send, Sparkles } from 'lucide-react';
import { Button, Card, Badge } from '@/components/ui';
import { testScenarios, type TestScenario } from '@/lib/test-scenarios';
import { useAgents, useWorkflows } from '@/hooks/use-platform-data';
import {
  ExecutionRecorder,
  nextRunId,
  nextSessionId,
  type ExecutionEvent,
} from '@/lib/workflow-events';
import { createMockRuntime } from '@/lib/runtime/mock-runtime';
import {
  createInteractiveStimulusSource,
  runConversationSession,
} from '@/lib/conversation-runtime';
import { projectConversation } from '@/lib/workflow-projections';
import { cn } from '@/lib/utils';

type Status = 'idle' | 'active' | 'ended';
type SessionControl = { submit: (text: string) => void; cancel: () => void };

// Drives a real consultation (runConversationSession / consultWorkflow / ExecutionRecorder)
// with a live person standing in for the caller, instead of the earlier setTimeout-based
// fake chat. See documentation/agent-model-design.md §6 — this is the same execution path
// "Run test" uses on a workflow (via the same shared runConversationSession envelope),
// not a second engine.
export function AgentTestingPanel({ agentId }: { agentId: string }) {
  const { data: agents } = useAgents();
  const { data: workflows, isLoading: workflowsLoading } = useWorkflows();
  const agent = agents?.find((item) => item.id === agentId);
  const workflow = workflows?.find((item) => item.agentIds.includes(agentId));

  const [status, setStatus] = useState<Status>('idle');
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [scenario, setScenario] = useState<TestScenario | null>(null);
  const controlRef = useRef<SessionControl | null>(null);
  const pendingFirstMessage = useRef<string | null>(null);
  // Bumped on every beginSession()/end() so a session's onPause/then callbacks can tell
  // whether they're still the current session before touching state — cancelling
  // settles run()'s promise, but its callbacks still fire afterward, and without this
  // guard they'd clobber the reset end() already applied (or a newer session's state).
  // Same pattern as workflow-detail.tsx's runToken.
  const sessionToken = useRef(0);

  const turns = useMemo(() => projectConversation(events), [events]);

  const beginSession = () => {
    if (!workflow) return;
    sessionToken.current += 1;
    const token = sessionToken.current;
    const runId = nextRunId();
    const recorder = new ExecutionRecorder(runId, nextSessionId());
    const { source, submit, cancel } = createInteractiveStimulusSource();
    controlRef.current = { submit, cancel };
    setStatus('active');
    setEvents([]);
    setReady(false);

    runConversationSession({
      workflow,
      runtime: createMockRuntime(),
      recorder,
      runId,
      stimulusSource: source,
      onPause: () => {
        if (sessionToken.current !== token) return;
        setEvents([...recorder.list()]);
        if (pendingFirstMessage.current) {
          const text = pendingFirstMessage.current;
          pendingFirstMessage.current = null;
          submit(text);
        } else {
          setReady(true);
        }
      },
    }).then(() => {
      if (sessionToken.current !== token) return;
      setStatus('ended');
      setReady(false);
    });
  };

  const start = (selected?: TestScenario) => {
    setScenario(selected ?? null);
    pendingFirstMessage.current = selected?.caller ?? null;
    beginSession();
  };

  // Calling cancel() unconditionally is safe whether a session is mid-flight (unblocks
  // the pending stimulus wait so run() settles with a truthful caller_hangup) or already
  // ended (nothing pending to resolve). Bumping the token first means that session's
  // onPause/then callbacks become no-ops once they do fire, so no stale callback
  // survives past this call to overwrite the reset below.
  const end = () => {
    sessionToken.current += 1;
    controlRef.current?.cancel();
    controlRef.current = null;
    setStatus('idle');
    setEvents([]);
    setReady(false);
    setScenario(null);
  };

  const send = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !ready) return;
    setReady(false);
    controlRef.current?.submit(text);
    setDraft('');
  };

  if (workflowsLoading)
    return (
      <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">Loading…</div>
    );

  if (!workflow) {
    return (
      <Card className="grid min-h-72 place-items-center p-8 text-center">
        <div>
          <Construction className="mx-auto text-muted-foreground" size={28} />
          <h2 className="mt-3 font-medium">No workflow attached</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {(agent?.name ?? 'This agent') +
              " isn't attached to a workflow yet. A workflow defines what the agent does on a call, so it's required before it can be tested here."}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b p-5">
        <div>
          <h2 className="font-medium">Call simulator</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Runs a real test consultation against {workflow.name}. No calls are placed.
          </p>
        </div>
        <Badge variant={status === 'active' ? 'success' : 'neutral'}>
          {status === 'active' ? 'Live simulation' : 'Ready'}
        </Badge>
      </div>

      {status === 'idle' && (
        <div className="grid gap-3 border-b bg-muted/30 p-4 md:grid-cols-3">
          {testScenarios.map((item) => (
            <button
              onClick={() => start(item)}
              className="rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted"
              key={item.id}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{item.title}</p>
                <Play size={14} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{item.goal}</p>
            </button>
          ))}
        </div>
      )}

      <div className="min-h-72 space-y-4 p-5">
        {turns.length === 0 ? (
          <div className="grid min-h-56 place-items-center text-center">
            <div>
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-muted">
                <Sparkles size={19} />
              </div>
              <p className="mt-3 font-medium">Test this agent safely</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Choose a scenario or start an open simulation to review agent behavior.
              </p>
            </div>
          </div>
        ) : (
          turns.map((turn, index) =>
            turn.speaker === 'system' ? (
              <p className="text-center text-xs text-muted-foreground" key={index}>
                {turn.text}
              </p>
            ) : (
              <div
                className={cn('max-w-[85%]', turn.speaker === 'caller' && 'ml-auto')}
                key={index}
              >
                <p className="mb-1 text-xs text-muted-foreground">
                  {turn.speaker === 'caller' ? 'Caller' : (agent?.name ?? 'Agent')}
                </p>
                <div
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm',
                    turn.speaker === 'caller' ? 'bg-foreground text-background' : 'bg-muted',
                  )}
                >
                  {turn.text}
                </div>
              </div>
            ),
          )
        )}
        {status !== 'idle' && scenario && turns.length >= 3 && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <p className="font-medium text-emerald-700 dark:text-emerald-400">Expected behavior</p>
            <p className="mt-1 text-muted-foreground">{scenario.expected}</p>
          </div>
        )}
      </div>

      <div className="border-t p-4">
        {status === 'idle' ? (
          <Button onClick={() => start()}>
            <Phone size={16} className="mr-2" />
            Start open test
          </Button>
        ) : (
          <form onSubmit={send} className="flex gap-2">
            <div className="relative flex-1">
              <Mic size={16} className="absolute left-3 top-2.5 text-muted-foreground" />
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="input pl-9"
                placeholder={
                  status === 'ended'
                    ? 'Test ended'
                    : ready
                      ? 'Type as the caller...'
                      : 'Waiting for the agent…'
                }
                disabled={status === 'ended' || !ready}
              />
            </div>
            <Button type="submit" aria-label="Send caller message" disabled={!ready}>
              <Send size={16} />
            </Button>
            <Button type="button" variant="outline" onClick={end}>
              <PhoneOff size={16} className="mr-2" />
              End
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
