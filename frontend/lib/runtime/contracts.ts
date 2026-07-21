// Runtime contracts — the platform's provider boundary.
//
//   Workflow Definition → Execution Engine → Runtime Interfaces → External Providers
//
// The execution engine depends only on these interfaces. A production runtime (OpenAI
// Realtime, Vapi, Twilio, ElevenLabs, internal services) becomes an implementation of
// them rather than a change to the engine, the event model, or the UI.
//
// Every method is async on purpose: real providers are network-bound. Defining these
// as synchronous today would force the engine and UI to be rewritten at integration
// time, which is exactly the architectural change this boundary exists to prevent.

import type { WorkflowContext, WorkflowValue } from '@/lib/workflow-context';

// Correlates a runtime call back to the run/step that caused it, so runtime activity
// can be recorded as ExecutionEvents with consistent identities.
export type RuntimeCallMeta = { runId: string; nodeId?: string; stepId?: string };

/* ---------------------------------------------------------------- Agent Runtime -- */

export type AgentRequest = {
  agentId: string;
  /** What the workflow node is asking the agent to do. */
  instruction: string;
  /** Read-only execution context; the runtime must not mutate it. */
  context: Readonly<WorkflowContext>;
  meta: RuntimeCallMeta;
};

export type AgentResult = {
  agentId: string;
  /** Resolved prompt/version configuration used for this turn. */
  promptVersion: string;
  model: string;
  voice: string;
  /** Assistant response output. */
  text: string;
  latencyMs: number;
};

export interface AgentRuntime {
  readonly provider: string;
  respond(request: AgentRequest): Promise<AgentResult>;
}

/* ----------------------------------------------------------------- Tool Runtime -- */

export type ToolRequest = {
  toolId: string;
  /** Already resolved from the node's input bindings by the engine. */
  inputs: Record<string, WorkflowValue>;
  meta: RuntimeCallMeta;
};

export type ToolResult = {
  toolId: string;
  toolName: string;
  status: 'ok' | 'error';
  /** Typed values keyed by the tool's declared output schema. */
  outputs: Record<string, WorkflowValue>;
  latencyMs: number;
  error?: string;
};

export interface ToolRuntime {
  readonly provider: string;
  invoke(request: ToolRequest): Promise<ToolResult>;
}

/* ------------------------------------------------------------ Knowledge Runtime -- */

export type KnowledgeRequest = {
  query: string;
  /** Optional source scoping; provider-agnostic identifiers or names. */
  sources?: string[];
  topK?: number;
  meta: RuntimeCallMeta;
};

export type KnowledgeMatch = { id: string; source: string; snippet: string; score: number };

export type KnowledgeResult = {
  query: string;
  /** Ranked, highest score first. */
  matches: KnowledgeMatch[];
  latencyMs: number;
};

export interface KnowledgeRuntime {
  readonly provider: string;
  retrieve(request: KnowledgeRequest): Promise<KnowledgeResult>;
}

/* -------------------------------------------------------------- Channel Runtime -- */

export type ChannelKind = 'voice' | 'chat' | 'sms';

export type ChannelSession = {
  sessionId: string;
  channel: ChannelKind;
  provider: string;
  /** Caller/session metadata merged into execution context session state. */
  caller: Record<string, WorkflowValue>;
};

export type ChannelOpenRequest = { workflowId: string; meta: RuntimeCallMeta };

export interface ChannelRuntime {
  readonly provider: string;
  readonly channel: ChannelKind;
  open(request: ChannelOpenRequest): Promise<ChannelSession>;
}

/* -------------------------------------------------------------------- Container -- */

export type PlatformRuntime = {
  agent: AgentRuntime;
  tool: ToolRuntime;
  knowledge: KnowledgeRuntime;
  channel: ChannelRuntime;
};
