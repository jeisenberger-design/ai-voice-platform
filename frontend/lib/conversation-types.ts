// Conversation domain model — see documentation/conversation-runtime-design.md
//
// These types belong to the Conversation Runtime layer, which owns sessions, turns,
// time and interruption. They are deliberately separate from the workflow definition:
// turns are not workflow nodes, and the workflow engine never creates a turn. The
// engine is consulted (see Stimulus/Directive/Cursor below) and returns policy.
//
// Session and turn records are projections of the event stream; the runtime may cache
// them, but the stream remains the source of truth.

import type { WorkflowValue } from '@/lib/workflow-context';

export type ChannelKind = 'voice' | 'chat' | 'sms';

export type SessionStatus = 'initializing' | 'active' | 'waiting_external' | 'transferring' | 'ended';
export type SessionEndReason = 'completed' | 'caller_hangup' | 'transferred' | 'error' | 'timeout';

export type ConversationSession = {
  sessionId: string;
  orgId: string;
  projectId: string;
  channel: ChannelKind;
  provider: string;
  workflowId: string;
  /** Pinned definition snapshot the session executes against. */
  definitionVersion: string;
  primaryAgentId?: string;
  status: SessionStatus;
  endReason?: SessionEndReason;
  startedAt: number;
};

export type TurnSpeaker = 'caller' | 'agent' | 'system';
export type TurnOrigin = 'speech' | 'policy' | 'system';
export type TurnStatus = 'in_progress' | 'completed' | 'interrupted' | 'abandoned';

export type ConversationTurn = {
  turnId: string;
  sessionId: string;
  seq: number;
  speaker: TurnSpeaker;
  origin: TurnOrigin;
  status: TurnStatus;
  text?: string;
  /** What was actually delivered before an interruption cut the turn short. */
  partialText?: string;
  interruptedBy?: string;
};

/* ------------------------------------------------- Consultation seam (engine) -- */

/** What caused the workflow to be consulted. */
export type Stimulus =
  | { kind: 'session.start' }
  | { kind: 'caller.turn'; turnId: string; text: string; intent?: string }
  | { kind: 'tool.result'; invocationId: string }
  | { kind: 'timer'; timerId: string };

/** The engine's only way to affect the world; executed by the Conversation Runtime. */
export type Directive =
  | { kind: 'speak'; text: string; interruptible: boolean }
  | { kind: 'listen'; expecting?: string[] }
  | { kind: 'invoke_tool'; invocationId: string; toolId: string; inputs: Record<string, WorkflowValue>; mode: 'sync' | 'async' }
  | { kind: 'transfer'; target: string }
  | { kind: 'end'; reason: string };

/** Where the next consultation resumes. `nodeId: null` starts at the trigger. */
export type Cursor = { nodeId: string | null };
