// Deterministic mock runtime implementations.
//
// These are the only place in the execution path that reads fixtures. They satisfy the
// contracts in ./contracts.ts so the engine never depends on where data comes from —
// swapping in a real provider means replacing these classes, nothing else.
//
// Everything here is deterministic: same request in, same result out, so simulated runs
// and their event streams stay reproducible.

import { agents, sources } from '@/lib/mock-data';
import { tools } from '@/lib/mock-tools';
import type {
  AgentRequest,
  AgentResult,
  AgentRuntime,
  ChannelOpenRequest,
  ChannelRuntime,
  ChannelSession,
  KnowledgeRequest,
  KnowledgeResult,
  KnowledgeRuntime,
  PlatformRuntime,
  ToolRequest,
  ToolResult,
  ToolRuntime,
} from '@/lib/runtime/contracts';

const AGENT_LATENCY_MS = 240;
const TOOL_LATENCY_MS = 120;
const KNOWLEDGE_LATENCY_MS = 90;

export class MockAgentRuntime implements AgentRuntime {
  readonly provider = 'mock-agent';

  async respond(request: AgentRequest): Promise<AgentResult> {
    const agent = agents.find((entry) => entry.id === request.agentId);
    if (!agent) {
      return {
        agentId: request.agentId,
        promptVersion: 'unknown',
        model: 'unknown',
        voice: 'unknown',
        text: request.instruction,
        latencyMs: AGENT_LATENCY_MS,
      };
    }
    return {
      agentId: agent.id,
      promptVersion: agent.promptVersion,
      model: agent.model,
      voice: agent.voice,
      // Mock responses echo the node's instruction; a real runtime returns generated text.
      text: request.instruction,
      latencyMs: AGENT_LATENCY_MS,
    };
  }
}

export class MockToolRuntime implements ToolRuntime {
  readonly provider = 'mock-tool';

  async invoke(request: ToolRequest): Promise<ToolResult> {
    const tool = tools.find((entry) => entry.id === request.toolId);
    if (!tool) {
      return {
        toolId: request.toolId,
        toolName: request.toolId,
        status: 'error',
        outputs: {},
        latencyMs: TOOL_LATENCY_MS,
        error: `Unknown tool: ${request.toolId}`,
      };
    }
    return {
      toolId: tool.id,
      toolName: tool.name,
      status: 'ok',
      // Typed against the tool's declared output schema.
      outputs: { ...tool.mockResult },
      latencyMs: TOOL_LATENCY_MS,
    };
  }
}

export class MockKnowledgeRuntime implements KnowledgeRuntime {
  readonly provider = 'mock-knowledge';

  async retrieve(request: KnowledgeRequest): Promise<KnowledgeResult> {
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const requested = (request.sources ?? []).map(normalize);
    const scoped = requested.length
      ? sources.filter((source) => requested.includes(normalize(source.name)))
      : sources;
    const pool = scoped.length ? scoped : sources;
    const topK = request.topK ?? 2;
    return {
      query: request.query,
      matches: pool.slice(0, topK).map((source, index) => ({
        id: `kb_${index + 1}`,
        source: source.name,
        snippet: `Relevant excerpt from ${source.name}.`,
        score: Number((0.92 - index * 0.11).toFixed(2)),
      })),
      latencyMs: KNOWLEDGE_LATENCY_MS,
    };
  }
}

export class MockChannelRuntime implements ChannelRuntime {
  readonly provider = 'mock-channel';
  readonly channel = 'voice' as const;

  async open(request: ChannelOpenRequest): Promise<ChannelSession> {
    // Session id is derived from the run so channel activity correlates with the run.
    return {
      sessionId: `sess_${request.meta.runId.replace(/^run_/, '')}`,
      channel: this.channel,
      provider: this.provider,
      caller: { callerPhone: '555-0100' },
    };
  }
}

export function createMockRuntime(): PlatformRuntime {
  return {
    agent: new MockAgentRuntime(),
    tool: new MockToolRuntime(),
    knowledge: new MockKnowledgeRuntime(),
    channel: new MockChannelRuntime(),
  };
}
