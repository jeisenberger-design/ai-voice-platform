// Deterministic mock runtime implementations.
//
// These satisfy the contracts in ./contracts.ts so the engine never depends on where
// data comes from — swapping in a real provider means replacing these classes, nothing
// else. Tool/Knowledge/Channel still read fixtures (mock-tools.ts, mock-data.ts's
// sources) directly — the only place in the execution path that does. Agent no longer
// does: as of Phase 2 (documentation/agent-model-implementation-plan.md),
// MockAgentRuntime resolves through AgentRepository (lib/agent-repository.ts) instead.
//
// Everything here is deterministic: same request in, same result out, so simulated runs
// and their event streams stay reproducible.

import { sources } from '@/lib/mock-data';
import { tools } from '@/lib/mock-tools';
import { getDefaultAgentRepository, type AgentRepository } from '@/lib/agent-repository';
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

  constructor(private readonly repository: AgentRepository = getDefaultAgentRepository()) {}

  async respond(request: AgentRequest): Promise<AgentResult> {
    // Resolves the pinned AgentVersion snapshot by id — never the live draft, never a
    // fresh lookup by agentId — so this always reflects exactly what
    // runConversationSession resolved at session start (see
    // documentation/agent-model-implementation-plan.md Phase 2).
    const version =
      request.agentVersionId !== 'unknown'
        ? await this.repository.getVersion(request.agentVersionId)
        : null;
    if (!version) {
      return {
        agentId: request.agentId,
        agentVersionId: request.agentVersionId,
        promptVersion: 'unknown',
        model: 'unknown',
        voice: 'unknown',
        text: request.instruction,
        latencyMs: AGENT_LATENCY_MS,
      };
    }
    return {
      agentId: request.agentId,
      agentVersionId: version.versionId,
      promptVersion: version.legacyLabel ?? `v${version.versionNumber}`,
      model: version.model,
      voice: version.voice,
      // Deterministic and visibly dependent on the resolved AgentVersion's own fields —
      // no longer a pure echo of the workflow node's instruction (Phase 2 requirement
      // 5). A real provider would generate free text from this config; this stays fully
      // mocked but proves the dependency by construction.
      text: `${version.instructions.Identity} ${request.instruction}`.trim(),
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

export function createMockRuntime(
  options: { agentRepository?: AgentRepository } = {},
): PlatformRuntime {
  return {
    agent: new MockAgentRuntime(options.agentRepository),
    tool: new MockToolRuntime(),
    knowledge: new MockKnowledgeRuntime(),
    channel: new MockChannelRuntime(),
  };
}
