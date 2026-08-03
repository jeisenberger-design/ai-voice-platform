import { describe, expect, it } from 'vitest';
import { consultWorkflow } from '@/lib/workflow-consultation';
import { ExecutionRecorder } from '@/lib/workflow-events';
import { createInitialContext } from '@/lib/workflow-context';
import { createMockRuntime } from '@/lib/runtime/mock-runtime';
import type { Workflow } from '@/lib/mock-workflows';

// Focused coverage for consultWorkflow's outcome vocabulary (see
// documentation/conversation-runtime-design.md and the Conversation Runtime
// stabilization pass) — a malformed graph must be tagged with why it stopped, never
// reported as a bare successful completion. `missing_edge` isn't covered here: every
// current NodeExecutor only ever proposes a nextEdgeId drawn from the node's own
// outgoing edges, so that branch is unreachable through real executor behavior today —
// it remains as defensive code for a future executor that could set it incorrectly.

const runtime = createMockRuntime();

function workflow(overrides: Pick<Workflow, 'nodes' | 'edges'>): Workflow {
  return {
    id: 'wf_test',
    name: 'Test workflow',
    description: '',
    status: 'Draft',
    trigger: 'Test',
    version: 1,
    variables: [],
    agentIds: [],
    toolIds: [],
    knowledgeSources: [],
    runsThisMonth: 0,
    successRate: 0,
    avgDuration: '0s',
    updated: '',
    ...overrides,
  };
}

async function run(wf: Workflow, cursorNodeId: string | null = null) {
  const recorder = new ExecutionRecorder('run_test', 'sess_test');
  const context = createInitialContext(wf.variables);
  return consultWorkflow({
    workflow: wf,
    context,
    stimulus: { kind: 'session.start' },
    cursor: { nodeId: cursorNodeId },
    runtime,
    recorder,
    runId: 'run_test',
    consultationId: 'run_test-c00',
    causeEventId: 'run_test-e000',
  });
}

describe('consultWorkflow — outcome truthfulness', () => {
  it('tags a dead end (a non-end node with no outgoing edge) instead of a bare completion', async () => {
    const wf = workflow({
      nodes: [{ id: 'n1', kind: 'message', label: 'Say something', position: { x: 0, y: 0 } }],
      edges: [],
    });

    const result = await run(wf);

    expect(result.status).toBe('completed');
    expect(result.outcome).toBe('dead_end');
  });

  it('tags a within-consultation cycle instead of a bare completion', async () => {
    const wf = workflow({
      nodes: [
        { id: 'n1', kind: 'message', label: 'A', position: { x: 0, y: 0 } },
        { id: 'n2', kind: 'message', label: 'B', position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n1' },
      ],
    });

    const result = await run(wf);

    expect(result.status).toBe('completed');
    expect(result.outcome).toBe('cycle_detected');
  });

  it('tags a resume cursor pointing at a node that no longer exists instead of a bare completion', async () => {
    const wf = workflow({
      nodes: [{ id: 'n1', kind: 'end', label: 'Done', position: { x: 0, y: 0 } }],
      edges: [],
    });

    const result = await run(wf, 'missing-node');

    expect(result.status).toBe('completed');
    expect(result.outcome).toBe('missing_resume_node');
  });

  it('tags reaching a real end node as outcome "end"', async () => {
    const wf = workflow({
      nodes: [{ id: 'n1', kind: 'end', label: 'Done', position: { x: 0, y: 0 } }],
      edges: [],
    });

    const result = await run(wf);

    expect(result.status).toBe('completed');
    expect(result.outcome).toBe('end');
  });
});
