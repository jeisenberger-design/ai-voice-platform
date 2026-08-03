'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, KeyRound, Link2, Play, Wrench } from 'lucide-react';
import { Badge, Button, Card } from '@/components/ui';
import { agents } from '@/lib/mock-data';
import type { Tool } from '@/lib/mock-tools';

export function ToolDetail({ tool }: { tool: Tool }) {
  const linkedAgents = agents.filter((agent) => tool.usedByAgents.includes(agent.id));
  return (
    <>
      <header className="mb-6">
        <Link
          href="/tools"
          className="mb-4 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Tools
        </Link>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-lg bg-foreground text-background">
              <Wrench size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{tool.name}</h1>
                <Badge variant={tool.status === 'Active' ? 'success' : 'neutral'}>
                  {tool.status}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {tool.category} · {tool.kind}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline">Edit tool</Button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className="p-5">
            <h2 className="font-medium">Description</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b p-5">
              <h2 className="font-medium">Parameters</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The inputs the agent must supply to call this tool.
              </p>
            </div>
            {tool.parameters.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                This tool takes no parameters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      {['Name', 'Type', 'Required', 'Description'].map((label) => (
                        <th className="px-5 py-3 font-medium" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tool.parameters.map((param) => (
                      <tr className="border-b last:border-0" key={param.name}>
                        <td className="px-5 py-3 font-medium">{param.name}</td>
                        <td className="px-5 py-3 text-muted-foreground">
                          {param.type}
                          {param.options ? ` (${param.options.join(', ')})` : ''}
                        </td>
                        <td className="px-5 py-3">
                          {param.required ? (
                            <Badge variant="warning">Required</Badge>
                          ) : (
                            <span className="text-muted-foreground">Optional</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{param.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b p-5">
              <h2 className="font-medium">Outputs</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The values this tool returns into workflow state.
              </p>
            </div>
            {tool.outputs.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                This tool returns no structured output.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      {['Name', 'Type', 'Description'].map((label) => (
                        <th className="px-5 py-3 font-medium" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tool.outputs.map((output) => (
                      <tr className="border-b last:border-0" key={output.name}>
                        <td className="px-5 py-3 font-medium">{output.name}</td>
                        <td className="px-5 py-3 text-muted-foreground">{output.type}</td>
                        <td className="px-5 py-3 text-muted-foreground">{output.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <ToolTester tool={tool} />
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-medium">Invocation</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <Wrench size={16} className="mt-0.5 text-muted-foreground" />
                <div>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-medium">{tool.kind}</dd>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <KeyRound size={16} className="mt-0.5 text-muted-foreground" />
                <div>
                  <dt className="text-muted-foreground">Authentication</dt>
                  <dd className="font-medium">{tool.authType}</dd>
                </div>
              </div>
              {tool.endpoint && (
                <div className="flex items-start gap-3">
                  <Link2 size={16} className="mt-0.5 text-muted-foreground" />
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Endpoint</dt>
                    <dd className="break-all font-mono text-xs">{tool.endpoint}</dd>
                  </div>
                </div>
              )}
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="font-medium">Usage</h2>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-semibold">{tool.callsThisMonth.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">Calls this month</p>
              </div>
              <div>
                <p className="text-2xl font-semibold">
                  {tool.callsThisMonth ? `${tool.successRate}%` : '—'}
                </p>
                <p className="text-sm text-muted-foreground">Success rate</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Updated {tool.updated}</p>
          </Card>

          <Card className="p-5">
            <h2 className="font-medium">Used by agents</h2>
            {linkedAgents.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No agents use this tool yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {linkedAgents.map((agent) => (
                  <Link
                    href={`/agents/${agent.id}`}
                    className="flex items-center gap-3 hover:underline"
                    key={agent.id}
                  >
                    <div className="grid size-8 place-items-center rounded-md bg-muted">
                      <Bot size={15} />
                    </div>
                    <span className="text-sm font-medium">{agent.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function ToolTester({ tool }: { tool: Tool }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const run = (event: FormEvent) => {
    event.preventDefault();
    setResult(
      JSON.stringify(
        {
          tool: tool.id,
          status: 'ok',
          latency_ms: 214,
          arguments: values,
          note: 'Mock invocation. No external request was made.',
        },
        null,
        2,
      ),
    );
  };
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b p-5">
        <div>
          <h2 className="font-medium">Test invocation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Locally simulate a call. No external request is made.
          </p>
        </div>
        <Badge variant="neutral">Mock</Badge>
      </div>
      <form onSubmit={run} className="space-y-4 p-5">
        {tool.parameters.map((param) => (
          <label className="block text-sm font-medium" key={param.name}>
            {param.name}
            {param.required && <span className="ml-1 text-amber-600 dark:text-amber-400">*</span>}
            <div className="mt-2">
              {param.type === 'enum' && param.options ? (
                <select
                  className="input"
                  value={values[param.name] ?? ''}
                  onChange={(e) =>
                    setValues((current) => ({ ...current, [param.name]: e.target.value }))
                  }
                >
                  <option value="">Select…</option>
                  {param.options.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="input"
                  value={values[param.name] ?? ''}
                  onChange={(e) =>
                    setValues((current) => ({ ...current, [param.name]: e.target.value }))
                  }
                  placeholder={param.description}
                />
              )}
            </div>
          </label>
        ))}
        <Button type="submit">
          <Play size={16} className="mr-2" />
          Run test
        </Button>
      </form>
      {result && (
        <div className="border-t p-5">
          <p className="mb-2 text-sm font-medium">Response</p>
          <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs">{result}</pre>
        </div>
      )}
    </Card>
  );
}
